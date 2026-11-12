import { Database, Download, ImagePlus, ShieldCheck, Sparkles, Trash2, Upload } from 'lucide-react'
import { useRef, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useAuthState } from '@/auth/AuthContext'
import { DoctorProfileForm } from '@/components/doctor/DoctorProfileForm'
import { Button } from '@/components/ui/Button'
import { Badge, PageHeader, Panel, Spinner } from '@/components/ui/Display'
import { DataTable, Pagination } from '@/components/ui/Table'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { env } from '@/config/env'
import { MAX_IMAGE_BYTES } from '@/domain/constants'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices, useServicesState, useWorkspace } from '@/context/ServicesContext'
import { useQuery } from '@/hooks/useQuery'
import { ValidationError } from '@/services/errors'
import { formatDateTime, todayIso } from '@/utils/dates'
import { downloadBlob, formatBytes } from '@/utils/format'

const TABS = ['profile', 'signature', 'data', 'audit'] as const

export function SettingsPage() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as string) : 'profile'
  return (
    <>
      <PageHeader title="Settings" description="Your profile, prescription signature, workspace data and activity log." />
      <Tabs
        label="Settings"
        active={tab}
        onChange={(t) => setParams(t === 'profile' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { id: 'profile', label: 'Profile and clinic' },
          { id: 'signature', label: 'Signature' },
          { id: 'data', label: 'Data and storage' },
          { id: 'audit', label: 'Activity log' },
        ]}
      />
      <TabPanel id="profile" active={tab}>
        <ProfileTab />
      </TabPanel>
      <TabPanel id="signature" active={tab}>
        <SignatureTab />
      </TabPanel>
      <TabPanel id="data" active={tab}>
        <DataTab />
      </TabPanel>
      <TabPanel id="audit" active={tab}>
        <AuditTab />
      </TabPanel>
    </>
  )
}

function ProfileTab() {
  const services = useServices()
  const feedback = useFeedback()
  const { doctor, refreshDoctor } = useWorkspace()
  const { mode } = useAuthState()
  if (!doctor) return <Spinner />
  return (
    <Panel>
      <DoctorProfileForm
        key={doctor.updatedAt}
        doctor={doctor}
        emailLocked={mode === 'clerk' && !!doctor.email}
        submitLabel="Save profile"
        onSubmit={async (values) => {
          await services.doctor.updateProfile(values)
          await refreshDoctor()
          feedback.success('Profile saved. New prescriptions will use these details.')
        }}
      />
      <p className="mt-4 text-[13px] text-muted">Prescriptions already issued keep the details they were issued with.</p>
    </Panel>
  )
}

function SignatureTab() {
  const services = useServices()
  const feedback = useFeedback()
  const { data: signature, loading } = useQuery((s) => s.doctor.getSignatureDataUrl(), [])
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const upload = async (file: File) => {
    setBusy(true)
    try {
      await services.doctor.setSignature(file)
      feedback.success('Signature saved')
    } catch (err) {
      feedback.error(err)
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <Panel title="Prescription signature" description="Printed above your name on every prescription and PDF.">
      {loading ? (
        <Spinner />
      ) : (
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center">
          <div className="grid h-28 w-64 place-items-center rounded-[var(--radius-control)] border border-dashed border-line-strong bg-canvas">
            {signature ? <img src={signature} alt="Your signature" className="max-h-24 max-w-60 object-contain" /> : <span className="text-sm text-muted">No signature yet</span>}
          </div>
          <div className="space-y-3">
            <p className="max-w-md text-[13.5px] text-muted">
              Sign on white paper, photograph or scan it, and crop tightly. PNG with a transparent background looks best. JPEG, PNG or WebP up to {formatBytes(MAX_IMAGE_BYTES)}.
            </p>
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label="Signature image" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            <div className="flex gap-2">
              <Button icon={ImagePlus} loading={busy} onClick={() => fileRef.current?.click()}>
                {signature ? 'Replace signature' : 'Upload signature'}
              </Button>
              {signature ? (
                <Button
                  variant="ghost"
                  icon={Trash2}
                  onClick={async () => {
                    await services.doctor.removeSignature()
                    feedback.success('Signature removed')
                  }}
                >
                  Remove
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </Panel>
  )
}

function DataTab() {
  const services = useServices()
  const feedback = useFeedback()
  const { ephemeral } = useServicesState()
  const { mode } = useAuthState()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [importErrors, setImportErrors] = useState<string[]>([])

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key)
    try {
      await fn()
    } catch (err) {
      feedback.error(err)
    } finally {
      setBusy(null)
    }
  }

  const exportAll = () =>
    run('export', async () => {
      const blob = await services.data.exportWorkbook()
      downloadBlob(blob, `clinicdesk-workspace-${todayIso()}.xlsx`)
      feedback.success('Workbook downloaded')
    })

  const importFile = async (file: File) => {
    setImportErrors([])
    const ok = await feedback.confirm({
      title: 'Replace your workspace with this workbook?',
      message: 'Every patient, visit, prescription, appointment and follow-up in your workspace is replaced by the workbook’s contents. Export a copy first if you might need the current data.',
      confirmLabel: 'Import and replace',
      tone: 'danger',
    })
    if (!ok) {
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    await run('import', async () => {
      try {
        const summary = await services.data.importWorkbook(await file.arrayBuffer())
        feedback.success(`Imported ${summary.counts.patients ?? 0} patients and ${summary.counts.visits ?? 0} visits`)
      } catch (err) {
        if (err instanceof ValidationError && err.fieldErrors.import) setImportErrors(err.fieldErrors.import.split('\n'))
        throw err
      } finally {
        if (fileRef.current) fileRef.current.value = ''
      }
    })
  }

  const loadSamples = async () => {
    const ok = await feedback.confirm({
      title: 'Load sample data?',
      message: 'Your current patients and records are replaced with fictional sample data. Your profile is kept.',
      confirmLabel: 'Load sample data',
    })
    if (ok) await run('samples', async () => {
      await services.data.loadSampleData()
      feedback.success('Sample data loaded')
    })
  }

  const clearAll = async () => {
    const ok = await feedback.confirm({
      title: 'Delete everything in this workspace?',
      message: 'All patients, visits, prescriptions, appointments, follow-ups, medicines and documents in your workspace are permanently deleted. Your profile is kept. This can’t be undone.',
      confirmLabel: 'Delete all records',
      tone: 'danger',
    })
    if (ok) await run('clear', async () => {
      await services.data.clearWorkspace()
      feedback.success('Workspace cleared')
    })
  }

  return (
    <div className="space-y-6">
      {services.storageType === 'API' ? (
        <div className="flex items-start gap-3 rounded-[var(--radius-panel)] border border-ok-100 bg-ok-50 px-4 py-3 text-sm text-ok-700">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>Records are saved to your clinic’s server database and appear on every device you sign in from.</p>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-[var(--radius-panel)] border border-warn-100 bg-warn-50 px-4 py-3 text-sm text-warn-700">
          <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            This prototype stores data in your browser (IndexedDB) on this device only. It is for synthetic demo data. Do not enter real patient information until the app runs on a secured backend database.
          </p>
        </div>
      )}

      <Panel title="Storage">
        <dl className="grid gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-[13px] text-muted">Storage</dt>
            <dd className="mt-0.5 flex items-center gap-2 font-semibold">
              <Database className="size-4 text-teal-600" aria-hidden />
              {services.storageType === 'API' ? 'Server database (Supabase Postgres)' : services.storageType === 'INDEXEDDB' ? 'Browser database (IndexedDB)' : 'In memory'}
              {ephemeral ? <Badge tone="warn">Lost when the tab closes</Badge> : null}
            </dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">Sign-in</dt>
            <dd className="mt-0.5 font-semibold">{mode === 'clerk' ? 'Clerk' : 'Demo workspace (not signed in)'}</dd>
          </div>
          <div>
            <dt className="text-[13px] text-muted">Configured storage type</dt>
            <dd className="tabular mt-0.5 font-semibold">STORAGE_TYPE={env.storageType}</dd>
          </div>
        </dl>
      </Panel>

      <Panel title="Excel" description="One workbook with a sheet per table: patients, visits, diagnoses, prescriptions, prescription_medicines, medicines, appointments, followups, medical_documents.">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-[var(--radius-control)] border border-line p-4">
            <h3 className="font-semibold">Export workspace</h3>
            <p className="mt-1 text-[13.5px] text-muted">Download everything as an .xlsx file. Document files themselves aren’t included; the workbook lists them.</p>
            <Button className="mt-3" icon={Download} loading={busy === 'export'} onClick={exportAll}>
              Export to Excel
            </Button>
          </div>
          <div className="rounded-[var(--radius-control)] border border-line p-4">
            <h3 className="font-semibold">Import workbook</h3>
            <p className="mt-1 text-[13.5px] text-muted">Replace your workspace from a workbook in the same layout. Every row is validated and every reference checked before anything is written.</p>
            <input ref={fileRef} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="sr-only" aria-label="Workbook to import" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
            <Button className="mt-3" variant="secondary" icon={Upload} loading={busy === 'import'} onClick={() => fileRef.current?.click()}>
              Import from Excel
            </Button>
          </div>
        </div>
        {importErrors.length ? (
          <div className="mt-4 rounded-[var(--radius-control)] border border-danger-100 bg-danger-50 p-4 text-[13px] text-danger-700" role="alert">
            <p className="font-semibold">Nothing was imported. Fix these rows and try again:</p>
            <ul className="mt-2 list-disc space-y-0.5 pl-5">
              {importErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </Panel>

      <Panel title="Workspace">
        <div className="grid gap-5 md:grid-cols-2">
          <div className="rounded-[var(--radius-control)] border border-line p-4">
            <h3 className="font-semibold">Sample data</h3>
            <p className="mt-1 text-[13.5px] text-muted">Fill your workspace with fictional patients, visits, prescriptions and appointments dated around today.</p>
            <Button className="mt-3" variant="secondary" icon={Sparkles} loading={busy === 'samples'} onClick={loadSamples}>
              Load sample data
            </Button>
          </div>
          <div className="rounded-[var(--radius-control)] border border-danger-100 p-4">
            <h3 className="font-semibold">Clear workspace</h3>
            <p className="mt-1 text-[13.5px] text-muted">Permanently delete every record in your workspace. Your profile stays.</p>
            <Button className="mt-3" variant="danger" icon={Trash2} loading={busy === 'clear'} onClick={clearAll}>
              Delete all records
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  )
}

function AuditTab() {
  const [page, setPage] = useState(1)
  const { data } = useQuery((s) => s.audit.list({ page, pageSize: 15 }), [page])
  if (!data) return <Spinner />
  return (
    <Panel title="Activity log" description="Every change to clinical records. Entries name the record and fields changed, never the clinical values." padded={false}>
      <DataTable
        dense
        rows={data.items}
        rowKey={(a) => a.auditId}
        columns={[
          { key: 'at', header: 'When', render: (a) => <span className="whitespace-nowrap">{formatDateTime(a.at)}</span> },
          { key: 'action', header: 'Action', render: (a) => <Badge tone={a.action === 'archive' || a.action === 'cancel' ? 'warn' : a.action === 'create' || a.action === 'issue' ? 'ok' : 'neutral'}>{a.action}</Badge> },
          { key: 'entity', header: 'Record', render: (a) => (<span className="whitespace-nowrap">{a.entity} <span className="tabular text-muted">{a.entityId}</span></span>) },
          { key: 'detail', header: 'Detail', hideBelow: 'md', render: (a) => <span className="text-[13px] text-muted">{a.detail || '—'}</span> },
        ]}
        empty={<p className="p-5 text-sm text-muted">No activity yet.</p>}
      />
      <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="entries" />
    </Panel>
  )
}


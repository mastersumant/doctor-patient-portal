import { Ban, Download, History, Pencil, Printer, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { BackLink } from '@/components/ui/BackLink'
import { Button, ButtonLink } from '@/components/ui/Button'
import { ErrorState, Panel, Spinner, StatusBadge } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { env } from '@/config/env'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices } from '@/context/ServicesContext'
import { useQuery } from '@/hooks/useQuery'
import type { PrescriptionDetail } from '@/services/prescriptionService'
import { formatDate, formatDateTime } from '@/utils/dates'
import { classNames, downloadBlob } from '@/utils/format'
import { NotFoundPage } from '../NotFoundPage'

export default function PrescriptionViewPage() {
  const { prescriptionId = '' } = useParams()
  const services = useServices()
  const feedback = useFeedback()
  const navigate = useNavigate()
  const { data: rx, loading, error, notFound } = useQuery((s) => s.prescriptions.get(prescriptionId), [prescriptionId])
  const { data: signature } = useQuery((s) => s.doctor.getSignatureDataUrl(), [])
  const [pdfBusy, setPdfBusy] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState('')

  if (notFound) return <NotFoundPage what="prescription" />
  if (error) return <ErrorState message={error} />
  if (loading || !rx) return <Spinner />

  const latest = rx.versions[0]
  const downloadPdf = async () => {
    setPdfBusy(true)
    try {
      const { buildPrescriptionPdf } = await import('@/utils/pdf/prescriptionPdf')
      const blob = await buildPrescriptionPdf(rx, { signatureDataUrl: signature })
      downloadBlob(blob, `${rx.rxNumber}-v${rx.version}-${rx.snapshot.patientName.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`)
    } catch (err) {
      feedback.error(err)
    } finally {
      setPdfBusy(false)
    }
  }

  const cancel = async () => {
    if (!reason.trim()) {
      setReasonError('Give a reason for cancelling')
      return
    }
    try {
      await services.prescriptions.cancel(rx.prescriptionId, reason)
      feedback.success(`${rx.rxNumber} cancelled`)
      setCancelOpen(false)
    } catch (err) {
      feedback.error(err)
    }
  }

  return (
    <>
      <div className="no-print">
        <BackLink to={`/patients/${rx.patientId}?tab=prescriptions`}>{rx.snapshot.patientName}</BackLink>
        <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="flex flex-wrap items-center gap-3 text-2xl font-bold">
            <span className="tabular">{rx.rxNumber}</span>
            {rx.version > 1 ? <span className="text-lg font-semibold text-muted">version {rx.version}</span> : null}
            <StatusBadge status={rx.status} />
          </h1>
          <div className="flex flex-wrap gap-2">
            <Button hidden={env.sandboxPreview} variant="secondary" icon={Printer} onClick={() => window.print()}>
              Print
            </Button>
            <Button variant="secondary" icon={Download} loading={pdfBusy} onClick={downloadPdf}>
              Download PDF
            </Button>
            {rx.status === 'Issued' ? (
              <>
                <ButtonLink to={`/prescriptions/${rx.prescriptionId}/revise`} icon={Pencil}>
                  Revise
                </ButtonLink>
                <Button variant="ghost" icon={Ban} onClick={() => setCancelOpen(true)}>
                  Cancel
                </Button>
              </>
            ) : null}
          </div>
        </div>
        {rx.status === 'Superseded' && latest ? (
          <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-panel)] border border-warn-100 bg-warn-50 px-4 py-3 text-sm text-warn-700">
            <History className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              This is the original version {rx.version} as issued. It was replaced by version {latest.version} on {formatDateTime(latest.issuedAt)}.{' '}
              <Link className="font-semibold underline" to={`/prescriptions/${latest.prescriptionId}`}>
                Open the current version
              </Link>
            </p>
          </div>
        ) : null}
        {rx.status === 'Cancelled' ? (
          <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-panel)] border border-danger-100 bg-danger-50 px-4 py-3 text-sm text-danger-700">
            <Ban className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>Cancelled{rx.editReason ? `: ${rx.editReason}` : ''}. Kept on record, not valid for dispensing.</p>
          </div>
        ) : null}
      </div>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <RxSheet rx={rx} signature={signature ?? null} />
        <aside className="no-print space-y-6">
          <Panel title="Versions" padded={false}>
            <ol className="divide-y divide-line">
              {rx.versions.map((v) => (
                <li key={v.prescriptionId}>
                  <Link
                    to={`/prescriptions/${v.prescriptionId}`}
                    className={classNames('block px-5 py-3 hover:bg-brand-50/40', v.prescriptionId === rx.prescriptionId && 'bg-brand-50/60')}
                    aria-current={v.prescriptionId === rx.prescriptionId ? 'page' : undefined}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">Version {v.version}</span>
                      <StatusBadge status={v.status} />
                    </div>
                    <p className="text-[13px] text-muted">{formatDateTime(v.issuedAt)}</p>
                    {v.editReason ? <p className="mt-0.5 text-[13px] text-ink-soft">{v.editReason}</p> : null}
                  </Link>
                </li>
              ))}
            </ol>
          </Panel>
          <Panel title="Linked records">
            <ul className="space-y-2 text-sm">
              <li>
                <Link to={`/patients/${rx.patientId}`} className="font-semibold text-brand-600 hover:underline">
                  Patient record
                </Link>
              </li>
              {rx.visitId ? (
                <li>
                  <Link to={`/visits/${rx.visitId}`} className="font-semibold text-brand-600 hover:underline">
                    Visit this was issued at
                  </Link>
                </li>
              ) : null}
            </ul>
            {!signature ? (
              <p className="mt-4 text-[13px] text-muted">
                No signature on file.{' '}
                <button onClick={() => navigate('/settings')} className="font-semibold text-brand-600 hover:underline">
                  Add one in Settings
                </button>{' '}
                to print it on prescriptions.
              </p>
            ) : null}
          </Panel>
        </aside>
      </div>

      <Modal
        open={cancelOpen}
        onClose={() => setCancelOpen(false)}
        title={`Cancel ${rx.rxNumber}?`}
        description="The prescription stays on record, marked cancelled. This can’t be undone."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setCancelOpen(false)}>
              Keep it
            </Button>
            <Button variant="danger" onClick={cancel}>
              Cancel prescription
            </Button>
          </>
        }
      >
        <Field label="Reason" required error={reasonError || undefined}>
          {(id, d) => (
            <Input
              id={id}
              aria-describedby={d}
              value={reason}
              invalid={!!reasonError}
              placeholder="e.g. Issued for the wrong patient"
              onChange={(e) => {
                setReason(e.target.value)
                setReasonError('')
              }}
            />
          )}
        </Field>
      </Modal>
    </>
  )
}

/** The prescription as a clinic letterhead sheet, used on screen and for printing. */
function RxSheet({ rx, signature }: { rx: PrescriptionDetail; signature: string | null }) {
  const s = rx.snapshot
  const allergies = s.patientAllergies && !/^none/i.test(s.patientAllergies.trim()) ? s.patientAllergies : ''
  return (
    <article className="print-area relative overflow-hidden rounded-[var(--radius-panel)] border border-line bg-surface shadow-panel" aria-label="Prescription">
      <div className="h-1.5 bg-brand-600" aria-hidden />
      {rx.status !== 'Issued' ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center" aria-hidden>
          <span className="-rotate-[24deg] text-[72px] font-bold tracking-wider text-danger-600/12">{rx.status.toUpperCase()}</span>
        </div>
      ) : null}
      <div className="px-6 py-6 sm:px-10 sm:py-8">
        <header className="flex flex-col gap-4 border-b border-line pb-6 sm:flex-row sm:justify-between">
          <div>
            <p className="text-[22px] leading-tight font-bold text-brand-800">{s.clinicName || 'Clinic'}</p>
            <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-muted">{s.clinicAddress}</p>
            {s.contactNumber ? <p className="tabular text-[13px] text-muted">{s.contactNumber}</p> : null}
          </div>
          <div className="sm:text-right">
            <p className="text-[17px] font-bold text-ink">{s.doctorName}</p>
            <p className="text-[13px] text-ink-soft">{[s.qualifications, s.specialization].filter(Boolean).join(', ')}</p>
            {s.registrationNumber ? <p className="tabular text-[13px] text-muted">Reg. No. {s.registrationNumber}</p> : null}
          </div>
        </header>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 py-5 text-[14px] sm:grid-cols-4">
          <div className="col-span-2">
            <dt className="text-[12px] text-muted">Patient</dt>
            <dd className="font-semibold text-ink">{s.patientName}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Age, gender</dt>
            <dd className="text-ink">
              {s.patientAge}, {s.patientGender}
            </dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Date</dt>
            <dd className="text-ink">{formatDate(rx.prescriptionDate)}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Patient ID</dt>
            <dd className="tabular text-ink">{rx.patientId}</dd>
          </div>
          <div>
            <dt className="text-[12px] text-muted">Mobile</dt>
            <dd className="tabular text-ink">{s.patientMobile}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-[12px] text-muted">Diagnosis</dt>
            <dd className="text-ink">{rx.diagnosis || '—'}</dd>
          </div>
        </dl>
        {allergies ? (
          <p className="mb-4 flex items-center gap-2 rounded-md bg-danger-50 px-3 py-2 text-[13.5px] font-semibold text-danger-700">
            <TriangleAlert className="size-4" aria-hidden /> Allergies: {allergies}
          </p>
        ) : null}

        <div className="flex items-end gap-3 border-t border-line pt-5">
          <span className="font-rx text-[44px] leading-none text-brand-600 italic" aria-label="Prescription">
            ℞
          </span>
        </div>

        <ol className="mt-3 divide-y divide-line">
          {rx.items.map((i, idx) => (
            <li key={i.id} className="grid gap-3 py-4 sm:grid-cols-[2rem_minmax(0,1.3fr)_minmax(0,2fr)]">
              <span className="tabular text-[15px] font-semibold text-muted">{idx + 1}.</span>
              <div>
                <p className="text-[16px] font-bold text-ink">
                  {i.medicineName} {i.strength ? <span className="font-semibold text-ink-soft">{i.strength}</span> : null}
                </p>
                <p className="text-[13px] text-muted">
                  {i.genericName && i.genericName !== i.medicineName ? `${i.genericName}, ` : ''}
                  {i.dosageForm.toLowerCase()}, {i.route.toLowerCase()}
                </p>
                {i.instructions ? <p className="mt-1 text-[13px] text-ink-soft">{i.instructions}</p> : null}
              </div>
              <dl className="grid grid-cols-3 gap-x-4 gap-y-2 text-[13.5px] sm:grid-cols-5">
                {[
                  ['Dose', i.dosage],
                  ['Frequency', i.frequency],
                  ['Timing', i.timing],
                  ['Duration', i.duration],
                  ['Quantity', i.quantity || '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11.5px] text-muted">{k}</dt>
                    <dd className="font-semibold text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </li>
          ))}
        </ol>

        {rx.instructions ? (
          <section className="mt-4 rounded-md bg-sunken/70 px-4 py-3">
            <h2 className="text-[12px] text-muted">Advice</h2>
            <p className="mt-0.5 text-[14.5px] leading-relaxed whitespace-pre-wrap text-ink">{rx.instructions}</p>
          </section>
        ) : null}

        <footer className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="text-[14px]">
            {rx.followUpDate ? (
              <>
                <p className="text-[12px] text-muted">Follow-up</p>
                <p className="font-semibold text-ink">{formatDate(rx.followUpDate, 'EEEE, d MMMM yyyy')}</p>
              </>
            ) : null}
          </div>
          <div className="min-w-56 text-right">
            {signature ? <img src={signature} alt="Doctor’s signature" className="ml-auto h-14 object-contain" /> : <div className="h-14" />}
            <div className="mt-1 border-t border-ink-soft/50 pt-1.5">
              <p className="text-[14px] font-semibold text-ink">{s.doctorName}</p>
              {s.registrationNumber ? <p className="tabular text-[12px] text-muted">Reg. No. {s.registrationNumber}</p> : null}
            </div>
          </div>
        </footer>
        <p className="tabular mt-8 border-t border-line pt-3 text-[11.5px] text-muted">
          {rx.rxNumber}, version {rx.version}, issued {formatDateTime(rx.issuedAt)}
          {rx.editReason && rx.status === 'Issued' ? `. Revised: ${rx.editReason}` : ''}
        </p>
      </div>
    </article>
  )
}

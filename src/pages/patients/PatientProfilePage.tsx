import {
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  ClipboardPlus,
  Download,
  Eye,
  FileText,
  Paperclip,
  Pencil,
  Phone,
  Stethoscope,
  Trash2,
  TriangleAlert,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { DocumentUploadModal } from '@/components/documents/DocumentUploadModal'
import { Timeline } from '@/components/patients/Timeline'
import { VitalsTrends } from '@/components/visits/VitalsTrends'
import { BackLink } from '@/components/ui/BackLink'
import { Button, ButtonLink, IconButton } from '@/components/ui/Button'
import { Avatar, Badge, DataList, EmptyState, ErrorState, Panel, Spinner, StatusBadge } from '@/components/ui/Display'
import { Select } from '@/components/ui/Field'
import { DataTable } from '@/components/ui/Table'
import { TabPanel, Tabs } from '@/components/ui/Tabs'
import { DIAGNOSIS_STATUSES } from '@/domain/constants'
import type { DiagnosisStatus, MedicalDocument, PatientListItem } from '@/domain/types'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices } from '@/context/ServicesContext'
import { useQuery } from '@/hooks/useQuery'
import { bmiBand, formatBp } from '@/utils/clinical'
import { formatDate, formatDateTime, formatTime, todayIso } from '@/utils/dates'
import { downloadBlob, formatBytes, splitList } from '@/utils/format'
import { NotFoundPage } from '../NotFoundPage'

const TABS = ['overview', 'history', 'visits', 'prescriptions', 'diagnoses', 'appointments', 'documents'] as const
type Tab = (typeof TABS)[number]

function hasAllergy(allergies: string): boolean {
  const v = allergies.trim().toLowerCase()
  return v !== '' && !['none', 'none known', 'nil', 'nkda', 'no known allergies'].includes(v)
}

export function PatientProfilePage() {
  const { patientId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const tab = (TABS.includes(params.get('tab') as Tab) ? params.get('tab') : 'overview') as Tab
  const { data: patient, loading, error, notFound } = useQuery((s) => s.patients.getDetail(patientId), [patientId])
  const { data: report } = useQuery((s) => s.analytics.patientReport(patientId), [patientId])
  const { data: photo } = useQuery((s) => (patient?.photoFileId ? s.patients.getPhoto(patient.photoFileId) : Promise.resolve(null)), [patient?.photoFileId])

  if (notFound) return <NotFoundPage what="patient" />
  if (error) return <ErrorState message={error} />
  if (loading || !patient) return <Spinner />

  const archived = !!patient.deletedAt
  const counts = report
    ? {
        visits: report.visits.length,
        prescriptions: report.prescriptions.length,
        diagnoses: report.diagnoses.length,
        appointments: report.appointments.filter((a) => !a.deletedAt).length,
        documents: report.documents.filter((d) => !d.deletedAt).length,
      }
    : null

  return (
    <>
      <BackLink to="/patients">Patients</BackLink>
      <header className="mb-6 flex flex-col gap-5 rounded-[var(--radius-panel)] border border-line bg-surface p-5 shadow-panel lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <Avatar name={patient.fullName} blob={photo} size={64} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[22px] leading-tight font-bold">{patient.fullName}</h1>
              <StatusBadge status={archived ? 'Archived' : patient.status} />
            </div>
            <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[14px] text-ink-soft">
              <span className="tabular">{patient.patientId}</span>
              <span>
                {patient.age} y, {patient.gender}
              </span>
              <span>Blood group {patient.bloodGroup}</span>
              <a href={`tel:${patient.mobile.replace(/\s/g, '')}`} className="tabular inline-flex items-center gap-1 hover:text-brand-700">
                <Phone className="size-3.5" aria-hidden />
                {patient.mobile}
              </a>
            </p>
            {hasAllergy(patient.allergies) ? (
              <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-danger-50 px-2 py-1 text-[13px] font-semibold text-danger-700">
                <TriangleAlert className="size-3.5" aria-hidden /> Allergies: {patient.allergies}
              </p>
            ) : null}
          </div>
        </div>
        {!archived ? (
          <div className="flex flex-wrap gap-2">
            <ButtonLink to={`/visits/new?patientId=${patient.patientId}`} icon={Stethoscope}>
              Record visit
            </ButtonLink>
            <ButtonLink to={`/prescriptions/new?patientId=${patient.patientId}`} variant="secondary" icon={ClipboardPlus}>
              Prescription
            </ButtonLink>
            <ButtonLink to={`/appointments?new=1&patientId=${patient.patientId}`} variant="secondary" icon={CalendarPlus}>
              Appointment
            </ButtonLink>
            <ButtonLink to={`/patients/${patient.patientId}/edit`} variant="ghost" icon={Pencil}>
              Edit
            </ButtonLink>
          </div>
        ) : (
          <p className="text-sm text-muted">Archived patients are read-only. Restore from the patient list to make changes.</p>
        )}
      </header>

      <Tabs
        label="Patient record"
        active={tab}
        onChange={(t) => setParams({ tab: t }, { replace: true })}
        tabs={[
          { id: 'overview', label: 'Overview' },
          { id: 'history', label: 'Medical history' },
          { id: 'visits', label: 'Visits', count: counts?.visits },
          { id: 'prescriptions', label: 'Prescriptions', count: counts?.prescriptions },
          { id: 'diagnoses', label: 'Diagnoses', count: counts?.diagnoses },
          { id: 'appointments', label: 'Appointments', count: counts?.appointments },
          { id: 'documents', label: 'Reports and attachments', count: counts?.documents },
        ]}
      />

      <TabPanel id="overview" active={tab}>
        <OverviewTab patient={patient} />
      </TabPanel>
      <TabPanel id="history" active={tab}>
        <HistoryTab patient={patient} />
      </TabPanel>
      <TabPanel id="visits" active={tab}>
        <VisitsTab patientId={patientId} archived={archived} />
      </TabPanel>
      <TabPanel id="prescriptions" active={tab}>
        <PrescriptionsTab patientId={patientId} archived={archived} />
      </TabPanel>
      <TabPanel id="diagnoses" active={tab}>
        <DiagnosesTab patientId={patientId} archived={archived} />
      </TabPanel>
      <TabPanel id="appointments" active={tab}>
        <AppointmentsTab patientId={patientId} archived={archived} />
      </TabPanel>
      <TabPanel id="documents" active={tab}>
        <DocumentsTab patientId={patientId} archived={archived} />
      </TabPanel>
    </>
  )
}

function OverviewTab({ patient }: { patient: PatientListItem }) {
  const { data: timeline } = useQuery((s) => s.analytics.timeline(patient.patientId), [patient.patientId])
  const { data: visits } = useQuery((s) => s.visits.listForPatient(patient.patientId), [patient.patientId])
  const { data: diagnoses } = useQuery((s) => s.diagnoses.listForPatient(patient.patientId), [patient.patientId])
  const latest = visits?.[0]
  const active = diagnoses?.filter((d) => d.status !== 'Resolved') ?? []
  const [showAll, setShowAll] = useState(false)

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)]">
      <div className="space-y-6">
        <Panel title="Latest vitals" description={latest ? `Recorded ${formatDateTime(latest.visitDateTime)}` : undefined}>
          {latest ? (
            <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                ['BP', formatBp(latest.bpSystolic, latest.bpDiastolic), 'mmHg'],
                ['Heart rate', latest.heartRate ?? '—', 'bpm'],
                ['Temperature', latest.temperatureF ?? '—', '°F'],
                ['SpO₂', latest.spo2 ?? '—', '%'],
                ['Resp. rate', latest.respiratoryRate ?? '—', '/min'],
                ['Weight', latest.weightKg ?? '—', 'kg'],
                ['Height', latest.heightCm ?? '—', 'cm'],
                ['BMI', latest.bmi ?? '—', patient.age >= 18 ? bmiBand(latest.bmi).label : ''],
              ].map(([label, value, unit]) => (
                <div key={String(label)}>
                  <dt className="text-[12.5px] text-muted">{label}</dt>
                  <dd className="tabular mt-0.5 text-lg font-semibold text-ink">
                    {value}
                    {value !== '—' && unit ? <span className="ml-1 text-[12px] font-normal text-muted">{unit}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <EmptyState compact icon={Stethoscope} title="No visits recorded" action={<ButtonLink size="sm" to={`/visits/new?patientId=${patient.patientId}`}>Record first visit</ButtonLink>} />
          )}
        </Panel>

        <Panel title="Active and chronic conditions">
          {active.length ? (
            <ul className="space-y-2.5">
              {active.slice(0, 6).map((d) => (
                <li key={d.diagnosisId} className="flex items-center justify-between gap-3">
                  <span>
                    <span className="font-semibold text-ink">{d.name}</span>
                    {d.icd10Code ? <span className="tabular ml-2 text-[12.5px] text-muted">{d.icd10Code}</span> : null}
                  </span>
                  <StatusBadge status={d.status} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No active conditions.</p>
          )}
        </Panel>

        <Panel title="Contact">
          <DataList
            items={[
              { label: 'Mobile', value: patient.mobile },
              { label: 'Email', value: patient.email },
              { label: 'Address', value: patient.address },
              { label: 'Emergency contact', value: [patient.emergencyContactName, patient.emergencyContactNumber].filter(Boolean).join(', ') },
              { label: 'Registered', value: formatDate(patient.registrationDate) },
              { label: 'Next follow-up', value: patient.nextFollowUp ? formatDate(patient.nextFollowUp) : '' },
            ]}
          />
        </Panel>
      </div>

      <Panel title="Medical journey" description="Visits, prescriptions, appointments and reports, newest first">
        {timeline ? (
          <>
            <Timeline events={timeline} limit={showAll ? undefined : 10} />
            {timeline.length > 10 ? (
              <button onClick={() => setShowAll((v) => !v)} className="mt-4 text-[13px] font-semibold text-brand-600 hover:underline">
                {showAll ? 'Show fewer' : `Show all ${timeline.length} events`}
              </button>
            ) : null}
          </>
        ) : (
          <Spinner />
        )}
      </Panel>
    </div>
  )
}

function HistoryTab({ patient }: { patient: PatientListItem }) {
  const sections: Array<[string, string]> = [
    ['Known allergies', patient.allergies],
    ['Existing medical conditions', patient.existingConditions],
    ['Chronic diseases', patient.chronicDiseases],
    ['Previous surgeries', patient.previousSurgeries],
    ['Family medical history', patient.familyHistory],
    ['Current medications', patient.currentMedications],
  ]
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {sections.map(([title, value]) => (
        <Panel key={title} title={title}>
          {splitList(value).length > 1 ? (
            <ul className="list-disc space-y-1 pl-5 text-[15px] text-ink">
              {splitList(value).map((v) => (
                <li key={v}>{v}</li>
              ))}
            </ul>
          ) : (
            <p className="text-[15px] text-ink">{value || <span className="text-muted">Not recorded</span>}</p>
          )}
        </Panel>
      ))}
      <Panel title="Medical notes" className="lg:col-span-2">
        <p className="text-[15px] whitespace-pre-wrap text-ink">{patient.medicalNotes || <span className="text-muted">No notes</span>}</p>
        <p className="mt-4 text-[13px] text-muted">
          Edit these from{' '}
          <Link to={`/patients/${patient.patientId}/edit`} className="font-semibold text-brand-600 hover:underline">
            patient details
          </Link>
          .
        </p>
      </Panel>
    </div>
  )
}

function VisitsTab({ patientId, archived }: { patientId: string; archived: boolean }) {
  const navigate = useNavigate()
  const { data: visits } = useQuery((s) => s.visits.listForPatient(patientId), [patientId])
  const { data: vitals } = useQuery((s) => s.visits.vitalsHistory(patientId), [patientId])
  if (!visits) return <Spinner />
  return (
    <div className="space-y-6">
      <Panel title="Compare vitals across visits">{vitals ? <VitalsTrends points={vitals} /> : <Spinner />}</Panel>
      <Panel
        title="Visit history"
        padded={false}
        actions={!archived ? <ButtonLink size="sm" to={`/visits/new?patientId=${patientId}`} icon={Stethoscope}>Record visit</ButtonLink> : undefined}
      >
        <DataTable
          rows={visits}
          rowKey={(v) => v.visitId}
          onRowClick={(v) => navigate(`/visits/${v.visitId}`)}
          empty={<EmptyState compact icon={Stethoscope} title="No visits yet" />}
          columns={[
            { key: 'date', header: 'Date', render: (v) => <span className="whitespace-nowrap">{formatDateTime(v.visitDateTime)}</span> },
            { key: 'type', header: 'Type', hideBelow: 'sm', render: (v) => <StatusBadge status={v.visitType} /> },
            { key: 'complaint', header: 'Complaint and diagnosis', render: (v) => (<div className="min-w-48"><p className="font-semibold text-ink">{v.chiefComplaint}</p><p className="text-[13px] text-muted">{v.diagnoses.map((d) => d.name).join(', ') || 'No diagnosis'}</p></div>) },
            { key: 'bp', header: 'BP', hideBelow: 'md', render: (v) => <span className="tabular">{formatBp(v.bpSystolic, v.bpDiastolic)}</span> },
            { key: 'fu', header: 'Follow-up', hideBelow: 'lg', render: (v) => formatDate(v.followUpDate) },
          ]}
        />
      </Panel>
    </div>
  )
}

function PrescriptionsTab({ patientId, archived }: { patientId: string; archived: boolean }) {
  const navigate = useNavigate()
  const { data } = useQuery((s) => s.prescriptions.list({ patientId, pageSize: 100 }), [patientId])
  if (!data) return <Spinner />
  return (
    <Panel
      title="Prescriptions"
      description="Current versions. Open one to see its revision history."
      padded={false}
      actions={!archived ? <ButtonLink size="sm" to={`/prescriptions/new?patientId=${patientId}`} icon={ClipboardPlus}>New prescription</ButtonLink> : undefined}
    >
      <DataTable
        rows={data.items}
        rowKey={(r) => r.prescriptionId}
        onRowClick={(r) => navigate(`/prescriptions/${r.prescriptionId}`)}
        empty={<EmptyState compact icon={ClipboardList} title="No prescriptions yet" />}
        columns={[
          { key: 'rx', header: 'Rx number', render: (r) => (<span className="tabular font-semibold whitespace-nowrap text-ink">{r.rxNumber}{r.version > 1 ? <span className="ml-1.5 text-[12px] font-normal text-muted">v{r.version}</span> : null}</span>) },
          { key: 'date', header: 'Date', render: (r) => <span className="whitespace-nowrap">{formatDate(r.prescriptionDate)}</span> },
          { key: 'meds', header: 'Medicines', render: (r) => <span className="line-clamp-2 min-w-48 text-[13.5px]">{r.medicineNames}</span> },
          { key: 'dx', header: 'Diagnosis', hideBelow: 'lg', render: (r) => <span className="line-clamp-1 text-[13.5px] text-muted">{r.diagnosis}</span> },
          { key: 'status', header: 'Status', render: (r) => <StatusBadge status={r.status} /> },
        ]}
      />
    </Panel>
  )
}

function DiagnosesTab({ patientId, archived }: { patientId: string; archived: boolean }) {
  const services = useServices()
  const feedback = useFeedback()
  const { data } = useQuery((s) => s.diagnoses.listForPatient(patientId), [patientId])
  if (!data) return <Spinner />
  return (
    <Panel title="Diagnoses" description="Added from visits. Change a status here to mark a condition resolved or chronic." padded={false}>
      <DataTable
        rows={data}
        rowKey={(d) => d.diagnosisId}
        empty={<EmptyState compact icon={ClipboardList} title="No diagnoses recorded" description="Diagnoses are added when you record a visit." />}
        columns={[
          { key: 'name', header: 'Diagnosis', render: (d) => (<div className="min-w-44"><p className="font-semibold text-ink">{d.name}</p>{d.symptoms ? <p className="text-[13px] text-muted">{d.symptoms}</p> : null}</div>) },
          { key: 'icd', header: 'ICD-10', hideBelow: 'sm', render: (d) => <span className="tabular">{d.icd10Code || '—'}</span> },
          { key: 'date', header: 'Date', render: (d) => <span className="whitespace-nowrap">{formatDate(d.diagnosisDate)}</span> },
          { key: 'sev', header: 'Severity', hideBelow: 'md', render: (d) => <StatusBadge status={d.severity} /> },
          {
            key: 'status',
            header: 'Status',
            render: (d) =>
              archived ? (
                <StatusBadge status={d.status} />
              ) : (
                <Select
                  aria-label={`Status of ${d.name}`}
                  value={d.status}
                  options={DIAGNOSIS_STATUSES}
                  className="h-8 w-32 text-[13.5px]"
                  onChange={async (e) => {
                    try {
                      await services.diagnoses.setStatus(d.diagnosisId, e.target.value as DiagnosisStatus)
                      feedback.success(`${d.name} marked ${e.target.value.toLowerCase()}`)
                    } catch (err) {
                      feedback.error(err)
                    }
                  }}
                />
              ),
          },
          { key: 'visit', header: <span className="sr-only">Visit</span>, align: 'right', render: (d) => <Link to={`/visits/${d.visitId}`} className="text-[13px] font-semibold whitespace-nowrap text-brand-600 hover:underline">View visit</Link> },
        ]}
      />
    </Panel>
  )
}

function AppointmentsTab({ patientId, archived }: { patientId: string; archived: boolean }) {
  const { data } = useQuery((s) => s.appointments.list({ patientId, order: 'desc' }), [patientId])
  if (!data) return <Spinner />
  const today = todayIso()
  return (
    <Panel
      title="Appointments"
      padded={false}
      actions={!archived ? <ButtonLink size="sm" to={`/appointments?new=1&patientId=${patientId}`} icon={CalendarPlus}>Book appointment</ButtonLink> : undefined}
    >
      <DataTable
        rows={data.items}
        rowKey={(a) => a.appointmentId}
        empty={<EmptyState compact icon={CalendarDays} title="No appointments" />}
        columns={[
          { key: 'date', header: 'Date', render: (a) => (<span className="whitespace-nowrap">{formatDate(a.date)}{a.date === today ? <Badge tone="brand" className="ml-2">Today</Badge> : null}</span>) },
          { key: 'time', header: 'Time', render: (a) => <span className="tabular whitespace-nowrap">{formatTime(a.startTime)}–{formatTime(a.endTime)}</span> },
          { key: 'type', header: 'Type', hideBelow: 'sm', render: (a) => a.type },
          { key: 'reason', header: 'Reason', hideBelow: 'md', render: (a) => <span className="text-[13.5px] text-muted">{a.reason || '—'}</span> },
          { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
        ]}
      />
    </Panel>
  )
}

function DocumentsTab({ patientId, archived }: { patientId: string; archived: boolean }) {
  const services = useServices()
  const feedback = useFeedback()
  const [open, setOpen] = useState(false)
  const [preview, setPreview] = useState<{ url: string; doc: MedicalDocument } | null>(null)
  const { data } = useQuery((s) => s.documents.listForPatient(patientId), [patientId])

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview.url) : undefined), [preview])

  const view = async (doc: MedicalDocument) => {
    try {
      const f = await services.documents.getFile(doc.documentId)
      setPreview({ url: URL.createObjectURL(f.blob), doc })
    } catch (err) {
      feedback.error(err)
    }
  }
  const download = async (doc: MedicalDocument) => {
    try {
      const f = await services.documents.getFile(doc.documentId)
      downloadBlob(f.blob, f.fileName)
    } catch (err) {
      feedback.error(err)
    }
  }
  const archive = async (doc: MedicalDocument) => {
    const ok = await feedback.confirm({ title: `Remove “${doc.name}”?`, message: 'It is archived with the patient record and no longer listed here.', confirmLabel: 'Remove document', tone: 'danger' })
    if (!ok) return
    try {
      await services.documents.archive(doc.documentId)
      feedback.success('Document removed')
    } catch (err) {
      feedback.error(err)
    }
  }

  if (!data) return <Spinner />
  return (
    <>
      <Panel
        title="Reports and attachments"
        description="Lab reports, scans and discharge summaries, stored on this device."
        padded={false}
        actions={!archived ? <Button size="sm" icon={Paperclip} onClick={() => setOpen(true)}>Add document</Button> : undefined}
      >
        <DataTable
          rows={data}
          rowKey={(d) => d.documentId}
          empty={<EmptyState compact icon={FileText} title="No documents yet" description="Add blood reports, X-rays or discharge summaries." action={!archived ? <Button size="sm" icon={Paperclip} onClick={() => setOpen(true)}>Add document</Button> : undefined} />}
          columns={[
            { key: 'name', header: 'Document', render: (d) => (<div className="flex min-w-44 items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-md bg-sunken text-muted"><FileText className="size-4" aria-hidden /></span><div className="min-w-0"><p className="truncate font-semibold text-ink">{d.name}</p><p className="text-[12.5px] text-muted">{d.fileName}, {formatBytes(d.sizeBytes)}</p></div></div>) },
            { key: 'type', header: 'Type', hideBelow: 'sm', render: (d) => d.type },
            { key: 'date', header: 'Date', render: (d) => <span className="whitespace-nowrap">{formatDate(d.uploadDate)}</span> },
            {
              key: 'actions',
              header: <span className="sr-only">Actions</span>,
              align: 'right',
              render: (d) => (
                <div className="flex justify-end gap-0.5">
                  <IconButton icon={Eye} label={`View ${d.name}`} onClick={() => view(d)} />
                  <IconButton icon={Download} label={`Download ${d.name}`} onClick={() => download(d)} />
                  {!archived ? <IconButton icon={Trash2} tone="danger" label={`Remove ${d.name}`} onClick={() => archive(d)} /> : null}
                </div>
              ),
            },
          ]}
        />
      </Panel>
      <DocumentUploadModal open={open} onClose={() => setOpen(false)} patientId={patientId} />
      {preview ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-ink/80 p-3 sm:p-8" role="dialog" aria-modal="true" aria-label={preview.doc.name}>
          <div className="mb-2 flex items-center justify-between text-white">
            <p className="font-semibold">{preview.doc.name}</p>
            <Button variant="secondary" size="sm" onClick={() => setPreview(null)}>
              Close
            </Button>
          </div>
          {preview.doc.mimeType === 'application/pdf' ? (
            <iframe title={preview.doc.name} src={preview.url} className="w-full flex-1 rounded-lg bg-white" />
          ) : (
            <div className="grid flex-1 place-items-center overflow-auto">
              <img src={preview.url} alt={preview.doc.name} className="max-h-full max-w-full rounded-lg bg-white" />
            </div>
          )}
        </div>
      ) : null}
    </>
  )
}

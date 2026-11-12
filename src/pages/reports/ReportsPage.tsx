import { endOfMonth, format, startOfMonth, startOfYear, subDays, subMonths } from 'date-fns'
import { CalendarClock, ClipboardList, FileSpreadsheet, Printer, Stethoscope, UserPlus, Users, CalendarDays } from 'lucide-react'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { ColumnChart, RankedBars } from '@/components/charts/Charts'
import { PatientPicker } from '@/components/patients/PatientPicker'
import { Button } from '@/components/ui/Button'
import { Badge, DataList, EmptyState, ErrorState, PageHeader, Panel, Spinner, StatusBadge } from '@/components/ui/Display'
import { Field, Input } from '@/components/ui/Field'
import { StatStrip } from '@/components/ui/StatStrip'
import { DataTable, Segmented } from '@/components/ui/Table'
import { env } from '@/config/env'
import { useFeedback } from '@/context/FeedbackContext'
import { useWorkspace } from '@/context/ServicesContext'
import { useQuery } from '@/hooks/useQuery'
import type { PatientReportData } from '@/services/analyticsService'
import { formatBp } from '@/utils/clinical'
import { formatDate, formatDateTime, formatTime, toIsoDate, todayIso } from '@/utils/dates'
import { downloadBlob } from '@/utils/format'

type Preset = 'month' | '30d' | '3m' | '6m' | 'year' | 'custom'

function presetRange(p: Preset): { from: string; to: string } {
  const now = new Date()
  switch (p) {
    case 'month':
      return { from: toIsoDate(startOfMonth(now)), to: toIsoDate(endOfMonth(now)) }
    case '30d':
      return { from: toIsoDate(subDays(now, 29)), to: todayIso() }
    case '3m':
      return { from: toIsoDate(startOfMonth(subMonths(now, 2))), to: todayIso() }
    case '6m':
      return { from: toIsoDate(startOfMonth(subMonths(now, 5))), to: todayIso() }
    case 'year':
      return { from: toIsoDate(startOfYear(now)), to: todayIso() }
    default:
      return { from: toIsoDate(startOfMonth(now)), to: todayIso() }
  }
}

export default function ReportsPage() {
  const [params, setParams] = useSearchParams()
  const mode = (params.get('mode') as 'practice' | 'patient') || 'practice'
  return (
    <>
      <PageHeader title="Reports" description="Practice activity for any period, or a complete summary for one patient. Export to Excel or print." />
      <div className="no-print mb-5">
        <Segmented<'practice' | 'patient'>
          label="Report type"
          value={mode}
          onChange={(v) => setParams(v === 'practice' ? {} : { mode: v }, { replace: true })}
          options={[
            { value: 'practice', label: 'Practice report' },
            { value: 'patient', label: 'Patient report' },
          ]}
        />
      </div>
      {mode === 'practice' ? <PracticeReport /> : <PatientReport />}
    </>
  )
}

function PracticeReport() {
  const feedback = useFeedback()
  const { doctor } = useWorkspace()
  const [preset, setPreset] = useState<Preset>('3m')
  const [custom, setCustom] = useState(presetRange('3m'))
  const range = preset === 'custom' ? custom : presetRange(preset)
  const valid = range.from <= range.to
  const { data, error, loading } = useQuery((s) => (valid ? s.analytics.report(range) : Promise.resolve(null)), [range.from, range.to])
  const [exporting, setExporting] = useState(false)

  const exportExcel = async () => {
    if (!data) return
    setExporting(true)
    try {
      const { exportPracticeReport } = await import('@/data/excel/reportExport')
      downloadBlob(await exportPracticeReport(data, doctor?.clinicName ?? ''), `practice-report-${range.from}-to-${range.to}.xlsx`)
    } catch (err) {
      feedback.error(err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Panel className="no-print mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-ink-soft">Period</p>
            <Segmented<Preset>
              label="Period"
              value={preset}
              onChange={setPreset}
              options={[
                { value: 'month', label: 'This month' },
                { value: '30d', label: 'Last 30 days' },
                { value: '3m', label: '3 months' },
                { value: '6m', label: '6 months' },
                { value: 'year', label: 'This year' },
                { value: 'custom', label: 'Custom' },
              ]}
            />
          </div>
          {preset === 'custom' ? (
            <div className="flex gap-3">
              <Field label="From" error={!valid ? 'Start must be before end' : undefined}>
                {(id) => <Input id={id} type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />}
              </Field>
              <Field label="To">
                {(id) => <Input id={id} type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />}
              </Field>
            </div>
          ) : null}
          <div className="flex gap-2 lg:ml-auto">
            <Button hidden={env.sandboxPreview} variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!data}>
              Print
            </Button>
            <Button icon={FileSpreadsheet} onClick={exportExcel} loading={exporting} disabled={!data}>
              Export to Excel
            </Button>
          </div>
        </div>
      </Panel>

      {error ? <ErrorState message={error} /> : null}
      {loading || !data ? (
        valid ? <Spinner /> : null
      ) : (
        <div className="print-area space-y-6">
          <div className="hidden print:block">
            <h1 className="text-xl font-bold">{doctor?.clinicName}: practice report</h1>
            <p className="text-sm">
              {formatDate(range.from)} to {formatDate(range.to)}, printed {formatDateTime(new Date().toISOString())}
            </p>
          </div>
          <p className="no-print text-sm text-muted">
            {formatDate(range.from)} to {formatDate(range.to)}
          </p>
          <StatStrip
            stats={[
              { label: 'Registered patients', value: data.totals.registeredPatients, icon: Users, detail: 'To end of period' },
              { label: 'New patients', value: data.totals.newPatients, icon: UserPlus, detail: 'In period' },
              { label: 'Visits', value: data.totals.visits, icon: Stethoscope, detail: `${data.totals.uniquePatientsSeen} patients seen` },
              { label: 'Prescriptions', value: data.totals.prescriptions, icon: ClipboardList, detail: 'Issued in period' },
              { label: 'Upcoming appointments', value: data.totals.upcomingAppointments, icon: CalendarDays, detail: 'From today' },
              { label: 'Pending follow-ups', value: data.totals.pendingFollowUps, icon: CalendarClock, detail: data.totals.overdueFollowUps ? `${data.totals.overdueFollowUps} overdue` : 'None overdue', alert: data.totals.overdueFollowUps > 0 },
            ]}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Patient visits" description={`Per ${data.visitsBucket} in the period`}>
              <ColumnChart data={data.visitsOverTime} caption="Visits over time" valueLabel="Visits" />
            </Panel>
            <Panel title="New patients by month">
              <ColumnChart data={data.newPatientsByMonth} caption="New patients by month" valueLabel="New patients" />
            </Panel>
            <Panel title="Most common diagnoses" description="Recorded in the period">
              <RankedBars data={data.topDiagnoses} caption="Most common diagnoses" />
            </Panel>
            <div className="grid gap-6">
              <Panel title="Visit types">
                <RankedBars data={data.visitTypes} caption="Visits by type" />
              </Panel>
              <Panel title="Appointments by status" description="Scheduled in the period">
                <RankedBars data={data.appointmentStatus} caption="Appointments by status" />
              </Panel>
            </div>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            <Panel title="Upcoming appointments" padded={false}>
              <DataTable
                dense
                rows={data.upcomingAppointments.slice(0, 10)}
                rowKey={(a) => a.appointmentId}
                empty={<EmptyState compact icon={CalendarDays} title="Nothing booked" />}
                columns={[
                  { key: 'd', header: 'Date', render: (a) => <span className="whitespace-nowrap">{formatDate(a.date, 'd MMM')}</span> },
                  { key: 't', header: 'Time', render: (a) => <span className="tabular whitespace-nowrap">{formatTime(a.startTime)}</span> },
                  { key: 'p', header: 'Patient', render: (a) => <span className="font-semibold whitespace-nowrap">{a.patientName}</span> },
                  { key: 's', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
                ]}
              />
            </Panel>
            <Panel title="Pending follow-ups" padded={false}>
              <DataTable
                dense
                rows={data.pendingFollowUps.slice(0, 10)}
                rowKey={(f) => f.followUpId}
                empty={<EmptyState compact icon={CalendarClock} title="No pending follow-ups" />}
                columns={[
                  { key: 'd', header: 'Due', render: (f) => <span className="whitespace-nowrap">{formatDate(f.dueDate, 'd MMM')}</span> },
                  { key: 'p', header: 'Patient', render: (f) => <span className="font-semibold whitespace-nowrap">{f.patientName}</span> },
                  { key: 'r', header: 'Reason', hideBelow: 'md', render: (f) => <span className="line-clamp-1 text-[13px] text-muted">{f.reason}</span> },
                  { key: 's', header: 'Status', render: (f) => (f.isOverdue ? <Badge tone="danger">Overdue</Badge> : <StatusBadge status={f.status} />) },
                ]}
              />
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}

function PatientReport() {
  const feedback = useFeedback()
  const [params, setParams] = useSearchParams()
  const patientId = params.get('patient') ?? ''
  const { data, error, loading } = useQuery((s) => (patientId ? s.analytics.patientReport(patientId) : Promise.resolve(null)), [patientId])
  const [exporting, setExporting] = useState(false)

  const exportExcel = async (r: PatientReportData) => {
    setExporting(true)
    try {
      const { exportPatientReport } = await import('@/data/excel/reportExport')
      downloadBlob(await exportPatientReport(r), `patient-report-${r.patient.patientId}.xlsx`)
    } catch (err) {
      feedback.error(err)
    } finally {
      setExporting(false)
    }
  }

  return (
    <>
      <Panel className="no-print mb-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <Field label="Patient" className="lg:w-[28rem]">
            {(id) => <PatientPicker id={id} value={patientId} onChange={(v) => setParams(v ? { mode: 'patient', patient: v } : { mode: 'patient' }, { replace: true })} />}
          </Field>
          <div className="flex gap-2 lg:ml-auto">
            <Button hidden={env.sandboxPreview} variant="secondary" icon={Printer} onClick={() => window.print()} disabled={!data}>
              Print
            </Button>
            <Button icon={FileSpreadsheet} onClick={() => data && exportExcel(data)} loading={exporting} disabled={!data}>
              Export to Excel
            </Button>
          </div>
        </div>
      </Panel>
      {!patientId ? (
        <Panel>
          <EmptyState icon={Users} title="Choose a patient" description="The report covers their details, every visit with vitals, diagnoses, prescriptions, appointments, follow-ups and documents." />
        </Panel>
      ) : error ? (
        <ErrorState message={error} />
      ) : loading || !data ? (
        <Spinner />
      ) : (
        <article className="print-area space-y-6">
          <Panel>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold">{data.patient.fullName}</h2>
                <p className="text-sm text-muted">
                  {data.patient.patientId}, {data.patient.age} y, {data.patient.gender}, blood group {data.patient.bloodGroup}
                </p>
              </div>
              <Link to={`/patients/${data.patient.patientId}`} className="no-print text-[13px] font-semibold text-brand-600 hover:underline">
                Open patient record
              </Link>
            </div>
            <div className="mt-5">
              <DataList
                columns={3}
                items={[
                  { label: 'Mobile', value: data.patient.mobile },
                  { label: 'Allergies', value: data.patient.allergies },
                  { label: 'Chronic diseases', value: data.patient.chronicDiseases },
                  { label: 'Current medications', value: data.patient.currentMedications },
                  { label: 'Family history', value: data.patient.familyHistory },
                  { label: 'Registered', value: formatDate(data.patient.registrationDate) },
                ]}
              />
            </div>
          </Panel>
          <Panel title={`Visits (${data.visits.length})`} padded={false}>
            <DataTable
              dense
              rows={data.visits}
              rowKey={(v) => v.visitId}
              empty={<EmptyState compact icon={Stethoscope} title="No visits" />}
              columns={[
                { key: 'd', header: 'Date', render: (v) => <span className="whitespace-nowrap">{formatDate(v.visitDateTime)}</span> },
                { key: 'c', header: 'Complaint', render: (v) => v.chiefComplaint },
                { key: 'dx', header: 'Diagnoses', hideBelow: 'md', render: (v) => <span className="text-[13px]">{v.diagnoses.map((d) => d.name).join(', ') || '—'}</span> },
                { key: 'bp', header: 'BP', render: (v) => <span className="tabular">{formatBp(v.bpSystolic, v.bpDiastolic)}</span> },
                { key: 'w', header: 'Weight', hideBelow: 'sm', render: (v) => <span className="tabular">{v.weightKg ?? '—'}</span> },
              ]}
            />
          </Panel>
          <Panel title={`Prescriptions (${data.prescriptions.length})`}>
            {data.prescriptions.length === 0 ? (
              <p className="text-sm text-muted">No prescriptions.</p>
            ) : (
              <ul className="divide-y divide-line">
                {data.prescriptions.map((rx) => (
                  <li key={rx.prescriptionId} className="py-3 first:pt-0 last:pb-0">
                    <p className="font-semibold">
                      <span className="tabular">{rx.rxNumber}</span>
                      {rx.version > 1 ? ` v${rx.version}` : ''}, {formatDate(rx.prescriptionDate)} <StatusBadge status={rx.status} />
                    </p>
                    <ul className="mt-1 text-[13.5px] text-ink-soft">
                      {rx.items.map((i) => (
                        <li key={i.id}>
                          {i.medicineName} {i.strength}: {i.dosage}, {i.frequency.toLowerCase()}, {i.timing.toLowerCase()}, {i.duration}
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Follow-ups" padded={false}>
              <DataTable
                dense
                rows={data.followUps}
                rowKey={(f) => f.followUpId}
                empty={<EmptyState compact icon={CalendarClock} title="No follow-ups" />}
                columns={[
                  { key: 'd', header: 'Due', render: (f) => formatDate(f.dueDate) },
                  { key: 'r', header: 'Reason', render: (f) => <span className="text-[13px]">{f.reason}</span> },
                  { key: 's', header: 'Status', render: (f) => (f.isOverdue ? <Badge tone="danger">Overdue</Badge> : <StatusBadge status={f.status} />) },
                ]}
              />
            </Panel>
            <Panel title="Documents" padded={false}>
              <DataTable
                dense
                rows={data.documents.filter((d) => !d.deletedAt)}
                rowKey={(d) => d.documentId}
                empty={<EmptyState compact icon={ClipboardList} title="No documents" />}
                columns={[
                  { key: 'd', header: 'Date', render: (d) => formatDate(d.uploadDate) },
                  { key: 'n', header: 'Name', render: (d) => d.name },
                  { key: 't', header: 'Type', hideBelow: 'sm', render: (d) => d.type },
                ]}
              />
            </Panel>
          </div>
          <p className="hidden text-[12px] print:block">Printed {format(new Date(), 'd MMM yyyy, h:mm a')}</p>
        </article>
      )}
    </>
  )
}

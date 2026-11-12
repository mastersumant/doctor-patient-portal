import { Archive, ClipboardPlus, Pencil } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router'
import { VitalsTrends } from '@/components/visits/VitalsTrends'
import { BackLink } from '@/components/ui/BackLink'
import { Button, ButtonLink } from '@/components/ui/Button'
import { Badge, DataList, ErrorState, PageHeader, Panel, Spinner, StatusBadge } from '@/components/ui/Display'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices } from '@/context/ServicesContext'
import { useQuery } from '@/hooks/useQuery'
import { bmiBand, formatBp } from '@/utils/clinical'
import { ageFromDob, formatDate, formatDateTime } from '@/utils/dates'
import { NotFoundPage } from '../NotFoundPage'

export function VisitDetailPage() {
  const { visitId = '' } = useParams()
  const services = useServices()
  const feedback = useFeedback()
  const navigate = useNavigate()
  const { data: visit, loading, error, notFound } = useQuery((s) => s.visits.get(visitId), [visitId])
  const { data: patient } = useQuery((s) => (visit ? s.patients.get(visit.patientId, { includeArchived: true }) : Promise.resolve(null)), [visit?.patientId])
  const { data: vitals } = useQuery((s) => (visit ? s.visits.vitalsHistory(visit.patientId) : Promise.resolve([])), [visit?.patientId])
  const { data: rx } = useQuery((s) => (visit ? s.prescriptions.list({ patientId: visit.patientId, pageSize: 50 }) : Promise.resolve(null)), [visit?.patientId])

  if (notFound) return <NotFoundPage what="visit" />
  if (error) return <ErrorState message={error} />
  if (loading || !visit) return <Spinner />

  const linkedRx = rx?.items.filter((r) => r.visitId === visit.visitId) ?? []
  const adult = patient ? ageFromDob(patient.dob) >= 18 : true

  const archive = async () => {
    const ok = await feedback.confirm({
      title: 'Archive this visit?',
      message: 'It is removed from lists and trends but kept in the record history. Prescriptions issued at this visit are not affected.',
      confirmLabel: 'Archive visit',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await services.visits.archive(visit.visitId)
      feedback.success('Visit archived')
      navigate(`/patients/${visit.patientId}?tab=visits`)
    } catch (err) {
      feedback.error(err)
    }
  }

  const vitalsList: Array<[string, string | number | null, string]> = [
    ['Blood pressure', formatBp(visit.bpSystolic, visit.bpDiastolic), 'mmHg'],
    ['Heart rate', visit.heartRate, 'bpm'],
    ['Temperature', visit.temperatureF, '°F'],
    ['Respiratory rate', visit.respiratoryRate, '/min'],
    ['SpO₂', visit.spo2, '%'],
    ['Weight', visit.weightKg, 'kg'],
    ['Height', visit.heightCm, 'cm'],
    ['BMI', visit.bmi, adult && visit.bmi ? bmiBand(visit.bmi).label : ''],
  ]

  return (
    <>
      <PageHeader
        back={<BackLink to={`/patients/${visit.patientId}?tab=visits`}>{patient?.fullName ?? 'Patient'}</BackLink>}
        title={visit.chiefComplaint}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={visit.visitType} />
            <span>{formatDateTime(visit.visitDateTime)}</span>
            <span className="tabular text-muted">{visit.visitId}</span>
          </span>
        }
        actions={
          <>
            <ButtonLink to={`/prescriptions/new?patientId=${visit.patientId}&visitId=${visit.visitId}`} icon={ClipboardPlus}>
              Prescribe
            </ButtonLink>
            <ButtonLink to={`/visits/${visit.visitId}/edit`} variant="secondary" icon={Pencil}>
              Edit visit
            </ButtonLink>
            <Button variant="ghost" icon={Archive} onClick={archive}>
              Archive
            </Button>
          </>
        }
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Vitals">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
              {vitalsList.map(([label, value, unit]) => (
                <div key={label}>
                  <dt className="text-[12.5px] text-muted">{label}</dt>
                  <dd className="tabular mt-0.5 text-lg font-semibold">
                    {value ?? '—'}
                    {value != null && value !== '—' && unit ? <span className="ml-1 text-[12px] font-normal text-muted">{unit}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          </Panel>

          <Panel title="Diagnoses">
            {visit.diagnoses.length === 0 ? (
              <p className="text-sm text-muted">No diagnosis recorded for this visit.</p>
            ) : (
              <ul className="divide-y divide-line">
                {visit.diagnoses.map((d) => (
                  <li key={d.diagnosisId} className="py-3 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink">{d.name}</p>
                      {d.icd10Code ? <Badge>{d.icd10Code}</Badge> : null}
                      <StatusBadge status={d.severity} />
                      <StatusBadge status={d.status} />
                    </div>
                    {d.description || d.treatmentNotes ? <p className="mt-1 text-[13.5px] text-muted">{[d.description, d.treatmentNotes].filter(Boolean).join(' ')}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Findings and plan">
            <DataList
              columns={1}
              items={[
                { label: 'Symptoms', value: visit.symptoms },
                { label: 'Clinical observations', value: visit.observations },
                { label: 'Treatment plan', value: visit.treatmentPlan },
                { label: 'Doctor’s notes', value: visit.notes },
              ]}
            />
          </Panel>

          <Panel title="Vitals compared with earlier visits">{vitals ? <VitalsTrends points={vitals} /> : <Spinner />}</Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Follow-up">
            {visit.followUpDate ? (
              <>
                <p className="text-lg font-semibold">{formatDate(visit.followUpDate, 'EEEE, d MMM yyyy')}</p>
                <Link to={`/follow-ups?patient=${visit.patientId}`} className="mt-2 inline-block text-[13px] font-semibold text-brand-600 hover:underline">
                  See follow-ups
                </Link>
              </>
            ) : (
              <p className="text-sm text-muted">No follow-up recommended.</p>
            )}
          </Panel>
          <Panel title="Prescriptions from this visit" padded={false}>
            {linkedRx.length === 0 ? (
              <div className="p-5 text-sm text-muted">
                None yet.{' '}
                <Link to={`/prescriptions/new?patientId=${visit.patientId}&visitId=${visit.visitId}`} className="font-semibold text-brand-600 hover:underline">
                  Write one
                </Link>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {linkedRx.map((r) => (
                  <li key={r.prescriptionId}>
                    <Link to={`/prescriptions/${r.prescriptionId}`} className="block px-5 py-3 hover:bg-brand-50/40">
                      <p className="tabular font-semibold text-ink">
                        {r.rxNumber}
                        {r.version > 1 ? ` v${r.version}` : ''}
                      </p>
                      <p className="text-[13px] text-muted">{r.medicineNames}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          {patient ? (
            <Panel title="Patient">
              <Link to={`/patients/${patient.patientId}`} className="font-semibold text-ink hover:text-brand-700">
                {patient.fullName}
              </Link>
              <p className="mt-0.5 text-[13.5px] text-muted">
                {ageFromDob(patient.dob)} y, {patient.gender}, {patient.bloodGroup}
              </p>
              {patient.allergies ? <p className="mt-2 text-[13.5px]">Allergies: {patient.allergies}</p> : null}
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus, Trash2 } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from 'react-hook-form'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { PatientPicker } from '@/components/patients/PatientPicker'
import { Autocomplete } from '@/components/ui/Autocomplete'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Badge, ErrorState, PageHeader, Panel, Spinner } from '@/components/ui/Display'
import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/Field'
import { DIAGNOSIS_STATUSES, SEVERITIES, VISIT_TYPES } from '@/domain/constants'
import { COMMON_ICD10 } from '@/domain/icd10'
import type { VisitWithDiagnoses } from '@/domain/types'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices } from '@/context/ServicesContext'
import { useQuery } from '@/hooks/useQuery'
import { bmiBand, calculateBmi, toNumberOrNull } from '@/utils/clinical'
import { addDaysIso, ageFromDob, todayIso } from '@/utils/dates'
import { applyServerErrors } from '@/utils/forms'
import { visitSchema, type DiagnosisInput, type VisitInput } from '@/validations/schemas'
import { NotFoundPage } from '../NotFoundPage'

const now = () => {
  const d = new Date()
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const emptyDiagnosis = (): DiagnosisInput => ({
  name: '',
  icd10Code: '',
  description: '',
  symptoms: '',
  diagnosisDate: todayIso(),
  severity: 'Mild',
  status: 'Active',
  treatmentNotes: '',
})

export function VisitFormPage() {
  const { visitId } = useParams()
  const { data: visit, loading, notFound, error } = useQuery((s) => (visitId ? s.visits.get(visitId) : Promise.resolve(null)), [visitId])
  if (visitId && notFound) return <NotFoundPage what="visit" />
  if (visitId && error) return <ErrorState message={error} />
  if (visitId && (loading || !visit)) return <Spinner />
  return <VisitForm key={visit?.visitId ?? 'new'} visit={visit ?? null} />
}

function VisitForm({ visit }: { visit: VisitWithDiagnoses | null }) {
  const services = useServices()
  const feedback = useFeedback()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const presetPatient = params.get('patientId') ?? ''
  const appointmentId = params.get('appointmentId') ?? ''

  const defaults: VisitInput = useMemo(
    () =>
      visit
        ? services.visits.toFormValues(visit)
        : {
            patientId: presetPatient,
            visitDate: todayIso(),
            visitTime: now(),
            visitType: 'New Consultation',
            chiefComplaint: '',
            symptoms: '',
            bpSystolic: '',
            bpDiastolic: '',
            heartRate: '',
            temperatureF: '',
            respiratoryRate: '',
            spo2: '',
            weightKg: '',
            heightCm: '',
            observations: '',
            treatmentPlan: '',
            notes: '',
            followUpDate: '',
            appointmentId,
            diagnoses: [emptyDiagnosis()],
          },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const {
    register,
    handleSubmit,
    control,
    setValue,
    setError,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<VisitInput>({ resolver: zodResolver(visitSchema), defaultValues: defaults })
  const { fields, append, remove } = useFieldArray({ control, name: 'diagnoses' })

  const patientId = useWatch({ control, name: 'patientId' })
  const [weight, height, visitDate] = useWatch({ control, name: ['weightKg', 'heightCm', 'visitDate'] })
  const bmi = calculateBmi(toNumberOrNull(weight), toNumberOrNull(height))
  const { data: patient } = useQuery((s) => (patientId ? s.patients.get(patientId) : Promise.resolve(null)), [patientId])
  const isAdult = patient ? ageFromDob(patient.dob) >= 18 : true

  // New visit for a returning patient: default to Follow-up and carry over height.
  useEffect(() => {
    if (visit || !patientId) return
    services.visits.latestForPatient(patientId).then((last) => {
      if (!last) return
      if (getValues('visitType') === 'New Consultation') setValue('visitType', 'Follow-up')
      if (!getValues('heightCm') && last.heightCm) setValue('heightCm', String(last.heightCm))
    })
  }, [patientId, visit, services, setValue, getValues])

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = visit ? await services.visits.update(visit.visitId, values) : await services.visits.create(values)
      feedback.success(visit ? 'Visit updated' : 'Visit recorded')
      navigate(`/visits/${saved.visitId}`)
    } catch (err) {
      if (!applyServerErrors(err, setError)) feedback.error(err)
    }
  })

  const e = errors
  return (
    <>
      <PageHeader
        back={<BackLink to={visit ? `/visits/${visit.visitId}` : patientId ? `/patients/${patientId}?tab=visits` : '/visits'}>Back</BackLink>}
        title={visit ? 'Edit visit' : 'Record a visit'}
        description={visit ? `Visit ${visit.visitId}. Each visit keeps its own record; editing doesn’t change other visits.` : 'Vitals, findings, diagnoses and the plan for this consultation.'}
      />
      <Panel>
        <form onSubmit={onSubmit} noValidate>
          <FormSection title="Visit" description={appointmentId ? 'Linked to today’s appointment, which is marked completed when you save.' : undefined}>
            <Field label="Patient" required error={e.patientId?.message} className="sm:col-span-2">
              {(id, d) => (
                <Controller
                  control={control}
                  name="patientId"
                  render={({ field }) => <PatientPicker id={id} describedBy={d} value={field.value} onChange={(v) => field.onChange(v)} invalid={!!e.patientId} disabled={!!visit} />}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Date" required error={e.visitDate?.message}>
                {(id) => <Input id={id} type="date" invalid={!!e.visitDate} {...register('visitDate')} />}
              </Field>
              <Field label="Time" required error={e.visitTime?.message}>
                {(id) => <Input id={id} type="time" invalid={!!e.visitTime} {...register('visitTime')} />}
              </Field>
            </div>
            <Field label="Visit type" required>
              {(id) => <Select id={id} options={VISIT_TYPES} {...register('visitType')} />}
            </Field>
            <Field label="Chief complaint" required error={e.chiefComplaint?.message} className="sm:col-span-2">
              {(id, d) => <Input id={id} aria-describedby={d} placeholder="e.g. Fever and sore throat for 3 days" invalid={!!e.chiefComplaint} {...register('chiefComplaint')} />}
            </Field>
            <Field label="Symptoms" className="sm:col-span-2">
              {(id) => <Textarea id={id} rows={2} {...register('symptoms')} />}
            </Field>
          </FormSection>

          <section className="grid gap-5 border-b border-line py-6 lg:grid-cols-[220px_1fr] lg:gap-10">
            <div>
              <h2 className="text-[15px] font-semibold">Vitals</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">All optional. BMI is calculated from weight and height.</p>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
              <Field label="Systolic BP" error={e.bpSystolic?.message}>
                {(id) => <Input id={id} inputMode="numeric" suffix="mmHg" invalid={!!e.bpSystolic} {...register('bpSystolic')} />}
              </Field>
              <Field label="Diastolic BP" error={e.bpDiastolic?.message}>
                {(id) => <Input id={id} inputMode="numeric" suffix="mmHg" invalid={!!e.bpDiastolic} {...register('bpDiastolic')} />}
              </Field>
              <Field label="Heart rate" error={e.heartRate?.message}>
                {(id) => <Input id={id} inputMode="numeric" suffix="bpm" invalid={!!e.heartRate} {...register('heartRate')} />}
              </Field>
              <Field label="Temperature" error={e.temperatureF?.message}>
                {(id) => <Input id={id} inputMode="decimal" suffix="°F" invalid={!!e.temperatureF} {...register('temperatureF')} />}
              </Field>
              <Field label="Respiratory rate" error={e.respiratoryRate?.message}>
                {(id) => <Input id={id} inputMode="numeric" suffix="/min" invalid={!!e.respiratoryRate} {...register('respiratoryRate')} />}
              </Field>
              <Field label="SpO₂" error={e.spo2?.message}>
                {(id) => <Input id={id} inputMode="numeric" suffix="%" invalid={!!e.spo2} {...register('spo2')} />}
              </Field>
              <Field label="Weight" error={e.weightKg?.message}>
                {(id) => <Input id={id} inputMode="decimal" suffix="kg" invalid={!!e.weightKg} {...register('weightKg')} />}
              </Field>
              <Field label="Height" error={e.heightCm?.message}>
                {(id) => <Input id={id} inputMode="decimal" suffix="cm" invalid={!!e.heightCm} {...register('heightCm')} />}
              </Field>
              <div className="col-span-2 flex items-center gap-3 rounded-[var(--radius-control)] bg-sunken px-4 py-2.5 md:col-span-4" aria-live="polite">
                <span className="text-[13px] font-semibold text-muted">BMI</span>
                <span className="tabular text-lg font-bold">{bmi ?? '—'}</span>
                {bmi && isAdult ? <Badge tone={bmiBand(bmi).tone === 'neutral' ? 'neutral' : bmiBand(bmi).tone}>{bmiBand(bmi).label}</Badge> : null}
                {bmi && !isAdult ? <span className="text-[13px] text-muted">Use age-specific growth charts for children</span> : null}
              </div>
            </div>
          </section>

          <FormSection title="Examination">
            <Field label="Clinical observations" className="sm:col-span-2">
              {(id) => <Textarea id={id} rows={3} {...register('observations')} />}
            </Field>
          </FormSection>

          <section className="grid gap-5 border-b border-line py-6 lg:grid-cols-[220px_1fr] lg:gap-10">
            <div>
              <h2 className="text-[15px] font-semibold">Diagnoses</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">Add one or more. Start typing to pick a common ICD-10 code, or enter your own.</p>
            </div>
            <div className="space-y-4">
              {fields.map((f, i) => (
                <DiagnosisRow key={f.id} index={i} control={control} register={register} setValue={setValue} errors={errors} onRemove={fields.length > 0 ? () => remove(i) : undefined} />
              ))}
              {fields.length === 0 ? <p className="text-sm text-muted">No diagnosis recorded for this visit.</p> : null}
              <Button variant="secondary" size="sm" icon={Plus} onClick={() => append({ ...emptyDiagnosis(), diagnosisDate: getValues('visitDate') || todayIso() })}>
                Add diagnosis
              </Button>
            </div>
          </section>

          <FormSection title="Plan">
            <Field label="Treatment plan" className="sm:col-span-2">
              {(id) => <Textarea id={id} rows={3} {...register('treatmentPlan')} />}
            </Field>
            <Field label="Doctor’s notes" className="sm:col-span-2">
              {(id) => <Textarea id={id} rows={2} {...register('notes')} />}
            </Field>
            <Field label="Recommended follow-up" error={e.followUpDate?.message} hint="Creates a follow-up reminder for this patient.">
              {(id, d) => <Input id={id} aria-describedby={d} type="date" min={visitDate} invalid={!!e.followUpDate} {...register('followUpDate')} />}
            </Field>
            <div className="flex flex-wrap items-end gap-2 pb-0.5">
              {[3, 7, 14, 30].map((days) => (
                <Button key={days} size="sm" variant="ghost" onClick={() => setValue('followUpDate', addDaysIso(getValues('visitDate') || todayIso(), days), { shouldValidate: true })}>
                  +{days} days
                </Button>
              ))}
            </div>
          </FormSection>

          <div className="flex justify-end gap-2 pt-5">
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {visit ? 'Save visit' : 'Record visit'}
            </Button>
          </div>
        </form>
      </Panel>
    </>
  )
}

function DiagnosisRow({
  index,
  control,
  register,
  setValue,
  errors,
  onRemove,
}: {
  index: number
  control: Control<VisitInput>
  register: UseFormRegister<VisitInput>
  setValue: UseFormSetValue<VisitInput>
  errors: FieldErrors<VisitInput>
  onRemove?: () => void
}) {
  const services = useServices()
  const err = errors.diagnoses?.[index]
  return (
    <div className="rounded-[var(--radius-control)] border border-line bg-canvas/60 p-4">
      <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
        <Field label={`Diagnosis ${index + 1}`} required error={err?.name?.message}>
          {(id, d) => (
            <Controller
              control={control}
              name={`diagnoses.${index}.name`}
              render={({ field }) => (
                <Autocomplete<{ code: string; name: string }>
                  id={id}
                  describedBy={d}
                  value={field.value}
                  invalid={!!err?.name}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  placeholder="e.g. Acute upper respiratory infection"
                  emptyText="No suggestions. Keep typing to enter your own."
                  fetchItems={async (term) => {
                    const t = term.trim().toLowerCase()
                    const known = (await services.diagnoses.knownNames()).map((k) => ({ code: k.icd10Code, name: k.name }))
                    const merged = [...known, ...COMMON_ICD10.filter((c) => !known.some((k) => k.name === c.name))]
                    return merged.filter((c) => !t || c.name.toLowerCase().includes(t) || c.code.toLowerCase().startsWith(t)).slice(0, 8)
                  }}
                  itemKey={(c) => c.code + c.name}
                  renderItem={(c) => (
                    <span className="flex justify-between gap-3">
                      <span>{c.name}</span>
                      <span className="tabular text-muted">{c.code}</span>
                    </span>
                  )}
                  onPick={(c) => {
                    field.onChange(c.name)
                    setValue(`diagnoses.${index}.icd10Code`, c.code, { shouldValidate: true })
                  }}
                />
              )}
            />
          )}
        </Field>
        <Field label="ICD-10" error={err?.icd10Code?.message}>
          {(id) => <Input id={id} placeholder="J06.9" invalid={!!err?.icd10Code} {...register(`diagnoses.${index}.icd10Code`)} />}
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Date" error={err?.diagnosisDate?.message}>
          {(id) => <Input id={id} type="date" {...register(`diagnoses.${index}.diagnosisDate`)} />}
        </Field>
        <Field label="Severity">
          {(id) => <Select id={id} options={SEVERITIES} {...register(`diagnoses.${index}.severity`)} />}
        </Field>
        <Field label="Status">
          {(id) => <Select id={id} options={DIAGNOSIS_STATUSES} {...register(`diagnoses.${index}.status`)} />}
        </Field>
        <div className="flex items-end justify-end">
          {onRemove ? (
            <Button variant="ghost" size="sm" icon={Trash2} onClick={onRemove}>
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      <details className="mt-3">
        <summary className="cursor-pointer text-[13px] font-semibold text-brand-600">Description, symptoms and treatment notes</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Description">
            {(id) => <Textarea id={id} rows={2} {...register(`diagnoses.${index}.description`)} />}
          </Field>
          <Field label="Symptoms">
            {(id) => <Textarea id={id} rows={2} {...register(`diagnoses.${index}.symptoms`)} />}
          </Field>
          <Field label="Treatment notes" className="sm:col-span-2">
            {(id) => <Textarea id={id} rows={2} {...register(`diagnoses.${index}.treatmentNotes`)} />}
          </Field>
        </div>
      </details>
    </div>
  )
}

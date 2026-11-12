import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowUp, History, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo } from 'react'
import { Controller, useFieldArray, useForm, useWatch, type Control, type FieldErrors, type UseFormRegister, type UseFormSetValue } from 'react-hook-form'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { PatientPicker } from '@/components/patients/PatientPicker'
import { Autocomplete } from '@/components/ui/Autocomplete'
import { BackLink } from '@/components/ui/BackLink'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge, ErrorState, PageHeader, Panel, Spinner } from '@/components/ui/Display'
import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/Field'
import { DOSAGE_FORMS, FREQUENCIES, ROUTES, TIMINGS } from '@/domain/constants'
import type { Medicine } from '@/domain/types'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices } from '@/context/ServicesContext'
import { useQuery } from '@/hooks/useQuery'
import type { PrescriptionDetail } from '@/services/prescriptionService'
import { addDaysIso, formatDate, formatDateTime, todayIso } from '@/utils/dates'
import { applyServerErrors } from '@/utils/forms'
import { prescriptionSchema, type PrescriptionInput, type PrescriptionItemInput } from '@/validations/schemas'
import { NotFoundPage } from '../NotFoundPage'

const emptyItem = (): PrescriptionItemInput => ({
  medicineId: '',
  medicineName: '',
  genericName: '',
  strength: '',
  dosage: '',
  dosageForm: 'Tablet',
  frequency: 'Twice Daily',
  route: 'Oral',
  duration: '',
  quantity: '',
  timing: 'After Food',
  instructions: '',
})

export function PrescriptionFormPage() {
  const { prescriptionId } = useParams()
  const { data: rx, loading, error, notFound } = useQuery((s) => (prescriptionId ? s.prescriptions.get(prescriptionId) : Promise.resolve(null)), [prescriptionId])
  if (prescriptionId && notFound) return <NotFoundPage what="prescription" />
  if (prescriptionId && error) return <ErrorState message={error} />
  if (prescriptionId && (loading || !rx)) return <Spinner />
  if (rx && rx.status !== 'Issued') {
    return (
      <ErrorState
        message={rx.status === 'Superseded' ? 'A newer version of this prescription exists. Open the latest version to revise it.' : 'Cancelled prescriptions cannot be revised.'}
      />
    )
  }
  return <PrescriptionForm key={rx?.prescriptionId ?? 'new'} previous={rx ?? null} />
}

function PrescriptionForm({ previous }: { previous: PrescriptionDetail | null }) {
  const services = useServices()
  const feedback = useFeedback()
  const navigate = useNavigate()
  const [params] = useSearchParams()

  const defaults: PrescriptionInput = useMemo(
    () =>
      previous
        ? { ...services.prescriptions.toFormValues(previous), prescriptionDate: todayIso() }
        : {
            patientId: params.get('patientId') ?? '',
            visitId: params.get('visitId') ?? '',
            prescriptionDate: todayIso(),
            diagnosis: '',
            instructions: '',
            followUpDate: '',
            editReason: '',
            items: [emptyItem()],
          },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<PrescriptionInput>({ resolver: zodResolver(prescriptionSchema), defaultValues: defaults })
  const { fields, append, remove, move } = useFieldArray({ control, name: 'items' })

  const patientId = useWatch({ control, name: 'patientId' })
  const visitId = useWatch({ control, name: 'visitId' })
  const { data: patient } = useQuery((s) => (patientId ? s.patients.get(patientId) : Promise.resolve(null)), [patientId])
  const { data: visits = [] } = useQuery((s) => (patientId ? s.visits.listForPatient(patientId) : Promise.resolve([])), [patientId])

  // Choosing a visit fills diagnosis and follow-up from it, unless already typed.
  useEffect(() => {
    if (!visitId) return
    const v = visits.find((x) => x.visitId === visitId)
    if (!v) return
    if (!getValues('diagnosis')) setValue('diagnosis', v.diagnoses.map((d) => d.name).join(', ') || v.chiefComplaint)
    if (!getValues('followUpDate') && v.followUpDate) setValue('followUpDate', v.followUpDate)
  }, [visitId, visits, getValues, setValue])

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = previous ? await services.prescriptions.revise(previous.prescriptionId, values) : await services.prescriptions.create(values)
      feedback.success(previous ? `Version ${saved.version} issued; version ${previous.version} kept on record` : `Prescription ${saved.rxNumber} issued`)
      navigate(`/prescriptions/${saved.prescriptionId}`)
    } catch (err) {
      if (!applyServerErrors(err, setError)) feedback.error(err)
    }
  })

  const allergies = patient?.allergies && !/^none/i.test(patient.allergies.trim()) ? patient.allergies : ''

  return (
    <>
      <PageHeader
        back={<BackLink to={previous ? `/prescriptions/${previous.prescriptionId}` : '/prescriptions'}>Back</BackLink>}
        title={previous ? `Revise ${previous.rxNumber}` : 'New prescription'}
        description={previous ? undefined : 'Pick medicines from your catalog or type any medicine name.'}
      />
      {previous ? (
        <div className="mb-5 flex items-start gap-3 rounded-[var(--radius-panel)] border border-brand-100 bg-brand-50 px-4 py-3 text-sm text-brand-800">
          <History className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>
            Saving issues <strong>version {previous.version + 1}</strong>. Version {previous.version}, issued {formatDateTime(previous.issuedAt)}, stays on record unchanged and is marked superseded.
          </p>
        </div>
      ) : null}

      <Panel>
        <form onSubmit={onSubmit} noValidate>
          <FormSection title="Patient and visit">
            <Field label="Patient" required error={errors.patientId?.message} className="sm:col-span-2">
              {(id, d) => (
                <Controller
                  control={control}
                  name="patientId"
                  render={({ field }) => (
                    <PatientPicker
                      id={id}
                      describedBy={d}
                      value={field.value}
                      disabled={!!previous}
                      invalid={!!errors.patientId}
                      onChange={(v) => {
                        field.onChange(v)
                        setValue('visitId', '')
                      }}
                    />
                  )}
                />
              )}
            </Field>
            <Field label="Visit" hint="Optional. Links the prescription to a consultation." error={errors.visitId?.message}>
              {(id, d) => (
                <Select
                  id={id}
                  aria-describedby={d}
                  disabled={!patientId}
                  placeholder={patientId ? 'Not linked to a visit' : 'Choose a patient first'}
                  options={visits.map((v) => ({ value: v.visitId, label: `${formatDate(v.visitDateTime)}: ${v.chiefComplaint}` }))}
                  {...register('visitId')}
                />
              )}
            </Field>
            <Field label="Prescription date" required error={errors.prescriptionDate?.message}>
              {(id) => <Input id={id} type="date" invalid={!!errors.prescriptionDate} {...register('prescriptionDate')} />}
            </Field>
            <Field label="Diagnosis" error={errors.diagnosis?.message} className="sm:col-span-2">
              {(id) => <Input id={id} placeholder="Printed on the prescription" {...register('diagnosis')} />}
            </Field>
          </FormSection>

          <section className="grid gap-5 border-b border-line py-6 lg:grid-cols-[220px_1fr] lg:gap-10">
            <div>
              <h2 className="text-[15px] font-semibold">Medicines</h2>
              <p className="mt-1 text-[13px] leading-relaxed text-muted">Type to search your catalog; picking one fills generic name, strength, form and route.</p>
            </div>
            <div className="space-y-4">
              {allergies ? (
                <p className="flex items-center gap-2 rounded-[var(--radius-control)] bg-danger-50 px-3 py-2 text-sm font-semibold text-danger-700" role="note">
                  <TriangleAlert className="size-4" aria-hidden /> Patient allergies: {allergies}
                </p>
              ) : null}
              {typeof errors.items?.message === 'string' ? <p className="text-sm text-danger-600">{errors.items.message}</p> : null}
              {fields.map((f, i) => (
                <MedicineRow
                  key={f.id}
                  index={i}
                  total={fields.length}
                  control={control}
                  register={register}
                  setValue={setValue}
                  errors={errors}
                  onRemove={() => remove(i)}
                  onMove={(dir) => move(i, i + dir)}
                />
              ))}
              <Button variant="secondary" size="sm" icon={Plus} onClick={() => append(emptyItem())}>
                Add medicine
              </Button>
            </div>
          </section>

          <FormSection title="Advice">
            <Field label="General instructions" className="sm:col-span-2" error={errors.instructions?.message}>
              {(id) => <Textarea id={id} rows={3} placeholder="Diet, rest, warning signs to return for…" {...register('instructions')} />}
            </Field>
            <Field label="Follow-up date" error={errors.followUpDate?.message}>
              {(id) => <Input id={id} type="date" invalid={!!errors.followUpDate} {...register('followUpDate')} />}
            </Field>
            <div className="flex flex-wrap items-end gap-2 pb-0.5">
              {[3, 7, 14, 30].map((d) => (
                <Button key={d} size="sm" variant="ghost" onClick={() => setValue('followUpDate', addDaysIso(getValues('prescriptionDate') || todayIso(), d), { shouldValidate: true })}>
                  +{d} days
                </Button>
              ))}
            </div>
            {previous ? (
              <Field label="Reason for revision" required error={errors.editReason?.message} className="sm:col-span-2" hint="Recorded with the new version and in the audit log.">
                {(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.editReason} placeholder="e.g. Dose reduced after review" {...register('editReason')} />}
              </Field>
            ) : null}
          </FormSection>

          <div className="flex justify-end gap-2 pt-5">
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {previous ? `Issue version ${previous.version + 1}` : 'Issue prescription'}
            </Button>
          </div>
        </form>
      </Panel>
    </>
  )
}

function MedicineRow({
  index,
  total,
  control,
  register,
  setValue,
  errors,
  onRemove,
  onMove,
}: {
  index: number
  total: number
  control: Control<PrescriptionInput>
  register: UseFormRegister<PrescriptionInput>
  setValue: UseFormSetValue<PrescriptionInput>
  errors: FieldErrors<PrescriptionInput>
  onRemove: () => void
  onMove: (dir: -1 | 1) => void
}) {
  const services = useServices()
  const err = errors.items?.[index]
  const medicineId = useWatch({ control, name: `items.${index}.medicineId` })

  const pick = (m: Medicine) => {
    const opts = { shouldValidate: true, shouldDirty: true }
    setValue(`items.${index}.medicineName`, m.name, opts)
    setValue(`items.${index}.medicineId`, m.medicineId)
    setValue(`items.${index}.genericName`, m.genericName, opts)
    setValue(`items.${index}.strength`, m.strength, opts)
    setValue(`items.${index}.dosageForm`, m.dosageForm, opts)
    setValue(`items.${index}.route`, m.route, opts)
  }

  return (
    <div className="rounded-[var(--radius-control)] border border-line bg-canvas/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[13px] font-semibold text-muted">
          <span className="tabular grid size-6 place-items-center rounded-full bg-brand-50 text-brand-700">{index + 1}</span>
          {medicineId ? <Badge tone="teal">From catalog</Badge> : <Badge>Typed in</Badge>}
        </span>
        <span className="flex gap-0.5">
          <IconButton icon={ArrowUp} label="Move up" disabled={index === 0} onClick={() => onMove(-1)} />
          <IconButton icon={ArrowDown} label="Move down" disabled={index === total - 1} onClick={() => onMove(1)} />
          <IconButton icon={Trash2} label={`Remove medicine ${index + 1}`} tone="danger" disabled={total === 1} onClick={onRemove} />
        </span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[2fr_1.4fr_1fr]">
        <Field label="Medicine" required error={err?.medicineName?.message}>
          {(id, d) => (
            <Controller
              control={control}
              name={`items.${index}.medicineName`}
              render={({ field }) => (
                <Autocomplete<Medicine>
                  id={id}
                  describedBy={d}
                  value={field.value}
                  invalid={!!err?.medicineName}
                  onBlur={field.onBlur}
                  onChange={(t) => {
                    field.onChange(t)
                    if (medicineId) setValue(`items.${index}.medicineId`, '')
                  }}
                  onPick={pick}
                  placeholder="Search catalog or type a name"
                  emptyText="Not in your catalog. Keep typing to prescribe it anyway."
                  fetchItems={(term) => services.medicines.searchActive(term, 8)}
                  itemKey={(m) => m.medicineId}
                  renderItem={(m) => (
                    <div>
                      <p className="font-semibold text-ink">
                        {m.name} <span className="font-normal text-ink-soft">{m.strength}</span>
                      </p>
                      <p className="text-[12.5px] text-muted">
                        {m.genericName}, {m.dosageForm.toLowerCase()}
                        {m.brandName ? `, ${m.brandName}` : ''}
                      </p>
                    </div>
                  )}
                />
              )}
            />
          )}
        </Field>
        <Field label="Generic name">
          {(id) => <Input id={id} {...register(`items.${index}.genericName`)} />}
        </Field>
        <Field label="Strength">
          {(id) => <Input id={id} placeholder="500 mg" {...register(`items.${index}.strength`)} />}
        </Field>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Field label="Dosage" required error={err?.dosage?.message}>
          {(id) => <Input id={id} placeholder="1 tablet" invalid={!!err?.dosage} {...register(`items.${index}.dosage`)} />}
        </Field>
        <Field label="Form">
          {(id) => <Select id={id} options={DOSAGE_FORMS} {...register(`items.${index}.dosageForm`)} />}
        </Field>
        <Field label="Frequency">
          {(id) => <Select id={id} options={FREQUENCIES} {...register(`items.${index}.frequency`)} />}
        </Field>
        <Field label="Timing">
          {(id) => <Select id={id} options={TIMINGS} {...register(`items.${index}.timing`)} />}
        </Field>
        <Field label="Duration" required error={err?.duration?.message}>
          {(id) => <Input id={id} placeholder="5 days" invalid={!!err?.duration} {...register(`items.${index}.duration`)} />}
        </Field>
        <Field label="Quantity">
          {(id) => <Input id={id} placeholder="10 tablets" {...register(`items.${index}.quantity`)} />}
        </Field>
        <Field label="Route" className="col-span-2 md:col-span-1">
          {(id) => <Select id={id} options={ROUTES} {...register(`items.${index}.route`)} />}
        </Field>
        <Field label="Special instructions" className="col-span-2 md:col-span-1">
          {(id) => <Input id={id} placeholder="Optional" {...register(`items.${index}.instructions`)} />}
        </Field>
      </div>
    </div>
  )
}

import { zodResolver } from '@hookform/resolvers/zod'
import { ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate, useParams } from 'react-router'
import { BackLink } from '@/components/ui/BackLink'
import { Button } from '@/components/ui/Button'
import { Avatar, ErrorState, PageHeader, Panel, Spinner } from '@/components/ui/Display'
import { Field, FormSection, Input, Select, Textarea } from '@/components/ui/Field'
import { BLOOD_GROUPS, GENDERS, MAX_IMAGE_BYTES, PATIENT_STATUSES } from '@/domain/constants'
import type { Patient } from '@/domain/types'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices } from '@/context/ServicesContext'
import { useQuery } from '@/hooks/useQuery'
import { patientSchema, type PatientInput } from '@/validations/schemas'
import { formatAge, todayIso } from '@/utils/dates'
import { formatBytes } from '@/utils/format'
import { applyServerErrors } from '@/utils/forms'
import { NotFoundPage } from '../NotFoundPage'

const EMPTY: PatientInput = {
  fullName: '',
  dob: '',
  gender: 'Female',
  bloodGroup: 'Unknown',
  mobile: '',
  email: '',
  address: '',
  emergencyContactName: '',
  emergencyContactNumber: '',
  allergies: '',
  existingConditions: '',
  chronicDiseases: '',
  previousSurgeries: '',
  familyHistory: '',
  currentMedications: '',
  medicalNotes: '',
  registrationDate: todayIso(),
  status: 'Active',
}

function toForm(p: Patient): PatientInput {
  const { fullName, dob, gender, bloodGroup, mobile, email, address, emergencyContactName, emergencyContactNumber, allergies, existingConditions, chronicDiseases, previousSurgeries, familyHistory, currentMedications, medicalNotes, registrationDate, status } = p
  return { fullName, dob, gender, bloodGroup, mobile, email, address, emergencyContactName, emergencyContactNumber, allergies, existingConditions, chronicDiseases, previousSurgeries, familyHistory, currentMedications, medicalNotes, registrationDate, status }
}

export function PatientFormPage() {
  const { patientId } = useParams()
  const editing = !!patientId
  const { data: patient, loading, notFound, error } = useQuery((s) => (patientId ? s.patients.get(patientId, { includeArchived: true }) : Promise.resolve(null)), [patientId])

  if (editing && notFound) return <NotFoundPage what="patient" />
  if (editing && error) return <ErrorState message={error} />
  if (editing && (loading || !patient)) return <Spinner />
  return <PatientForm key={patient?.patientId ?? 'new'} patient={patient ?? null} />
}

function PatientForm({ patient }: { patient: Patient | null }) {
  const services = useServices()
  const feedback = useFeedback()
  const navigate = useNavigate()
  const [photo, setPhoto] = useState<File | null>(null)
  const [existingPhoto, setExistingPhoto] = useState<Blob | null>(null)
  const [removePhoto, setRemovePhoto] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors, isSubmitting },
  } = useForm<PatientInput>({ resolver: zodResolver(patientSchema), defaultValues: patient ? toForm(patient) : EMPTY })

  const dob = useWatch({ control, name: 'dob' })
  const fullName = useWatch({ control, name: 'fullName' })

  useEffect(() => {
    if (patient?.photoFileId) services.patients.getPhoto(patient.photoFileId).then(setExistingPhoto)
  }, [patient, services])

  const onSubmit = handleSubmit(async (values) => {
    try {
      const saved = patient ? await services.patients.update(patient.patientId, values) : await services.patients.create(values)
      if (photo) {
        try {
          await services.patients.setPhoto(saved.patientId, photo)
        } catch (err) {
          feedback.error(err)
        }
      } else if (removePhoto && patient?.photoFileId) {
        await services.patients.removePhoto(saved.patientId)
      }
      feedback.success(patient ? 'Patient details saved' : `${saved.fullName} registered as ${saved.patientId}`)
      navigate(`/patients/${saved.patientId}`)
    } catch (err) {
      if (!applyServerErrors(err, setError)) feedback.error(err)
    }
  })

  const err = (k: keyof PatientInput) => errors[k]?.message
  const shownPhoto = photo ?? (removePhoto ? null : existingPhoto)

  return (
    <>
      <PageHeader
        back={<BackLink to={patient ? `/patients/${patient.patientId}` : '/patients'}>{patient ? patient.fullName : 'Patients'}</BackLink>}
        title={patient ? 'Edit patient' : 'Register a patient'}
        description={patient ? `Patient ID ${patient.patientId}` : 'A patient ID is generated when you save.'}
      />
      <Panel>
        <form onSubmit={onSubmit} noValidate>
          <FormSection title="Personal information" description="Name, date of birth and a mobile number are required.">
            <div className="flex items-center gap-4 sm:col-span-2">
              <Avatar name={fullName || '?'} blob={shownPhoto} size={64} />
              <div className="flex flex-wrap gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  aria-label="Profile photo"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null
                    if (f && f.size > MAX_IMAGE_BYTES) {
                      feedback.error(`Photos must be ${formatBytes(MAX_IMAGE_BYTES)} or smaller`)
                      return
                    }
                    setPhoto(f)
                    setRemovePhoto(false)
                  }}
                />
                <Button variant="secondary" size="sm" icon={ImagePlus} onClick={() => fileRef.current?.click()}>
                  {shownPhoto ? 'Change photo' : 'Add photo'}
                </Button>
                {shownPhoto ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={Trash2}
                    onClick={() => {
                      setPhoto(null)
                      setRemovePhoto(true)
                      if (fileRef.current) fileRef.current.value = ''
                    }}
                  >
                    Remove
                  </Button>
                ) : null}
                <p className="w-full text-[12.5px] text-muted">Optional. JPEG, PNG or WebP up to {formatBytes(MAX_IMAGE_BYTES)}.</p>
              </div>
            </div>
            <Field label="Full name" required error={err('fullName')} className="sm:col-span-2">
              {(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.fullName} autoComplete="off" {...register('fullName')} />}
            </Field>
            <Field label="Date of birth" required error={err('dob')} hint={dob ? `Age: ${formatAge(dob)}` : 'Age is calculated automatically'}>
              {(id, d) => <Input id={id} aria-describedby={d} type="date" max={todayIso()} invalid={!!errors.dob} {...register('dob')} />}
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Gender" required error={err('gender')}>
                {(id) => <Select id={id} options={GENDERS} {...register('gender')} />}
              </Field>
              <Field label="Blood group" error={err('bloodGroup')}>
                {(id) => <Select id={id} options={BLOOD_GROUPS} {...register('bloodGroup')} />}
              </Field>
            </div>
            <Field label="Mobile number" required error={err('mobile')}>
              {(id, d) => <Input id={id} aria-describedby={d} type="tel" inputMode="tel" placeholder="+91 98xxx xxxxx" invalid={!!errors.mobile} {...register('mobile')} />}
            </Field>
            <Field label="Email" error={err('email')}>
              {(id, d) => <Input id={id} aria-describedby={d} type="email" invalid={!!errors.email} {...register('email')} />}
            </Field>
            <Field label="Address" error={err('address')} className="sm:col-span-2">
              {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} {...register('address')} />}
            </Field>
            <Field label="Emergency contact name" error={err('emergencyContactName')}>
              {(id) => <Input id={id} {...register('emergencyContactName')} />}
            </Field>
            <Field label="Emergency contact number" error={err('emergencyContactNumber')}>
              {(id, d) => <Input id={id} aria-describedby={d} type="tel" invalid={!!errors.emergencyContactNumber} {...register('emergencyContactNumber')} />}
            </Field>
          </FormSection>

          <FormSection title="Medical information" description="Allergies are printed on every prescription for this patient.">
            <Field label="Known allergies" error={err('allergies')} hint="e.g. Penicillin, peanuts. Write “None known” if none." className="sm:col-span-2">
              {(id, d) => <Input id={id} aria-describedby={d} {...register('allergies')} />}
            </Field>
            <Field label="Existing medical conditions" error={err('existingConditions')}>
              {(id) => <Textarea id={id} rows={2} {...register('existingConditions')} />}
            </Field>
            <Field label="Chronic diseases" error={err('chronicDiseases')}>
              {(id) => <Textarea id={id} rows={2} {...register('chronicDiseases')} />}
            </Field>
            <Field label="Previous surgeries" error={err('previousSurgeries')}>
              {(id) => <Textarea id={id} rows={2} {...register('previousSurgeries')} />}
            </Field>
            <Field label="Family medical history" error={err('familyHistory')}>
              {(id) => <Textarea id={id} rows={2} {...register('familyHistory')} />}
            </Field>
            <Field label="Current medications" error={err('currentMedications')} className="sm:col-span-2">
              {(id) => <Textarea id={id} rows={2} {...register('currentMedications')} />}
            </Field>
            <Field label="Relevant medical notes" error={err('medicalNotes')} className="sm:col-span-2">
              {(id) => <Textarea id={id} rows={3} {...register('medicalNotes')} />}
            </Field>
          </FormSection>

          <FormSection title="Registration">
            <Field label="Registration date" required error={err('registrationDate')}>
              {(id, d) => <Input id={id} aria-describedby={d} type="date" invalid={!!errors.registrationDate} {...register('registrationDate')} />}
            </Field>
            <Field label="Status" error={err('status')} hint="Inactive patients stay searchable but are marked as not under active care.">
              {(id, d) => <Select id={id} aria-describedby={d} options={PATIENT_STATUSES} {...register('status')} />}
            </Field>
          </FormSection>

          <div className="flex justify-end gap-2 border-t border-line pt-5">
            <Button variant="secondary" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {patient ? 'Save changes' : 'Register patient'}
            </Button>
          </div>
        </form>
      </Panel>
    </>
  )
}

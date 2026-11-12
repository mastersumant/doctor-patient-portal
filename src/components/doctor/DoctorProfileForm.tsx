import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import type { Doctor } from '@/domain/types'
import { doctorProfileSchema, type DoctorProfileInput } from '@/validations/schemas'
import { Field, FormSection, Input, Textarea } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { applyServerErrors } from '@/utils/forms'
import type { ReactNode } from 'react'

export function doctorToForm(d: Doctor): DoctorProfileInput {
  return {
    fullName: d.fullName,
    email: d.email,
    specialization: d.specialization,
    qualifications: d.qualifications,
    registrationNumber: d.registrationNumber,
    clinicName: d.clinicName,
    clinicAddress: d.clinicAddress,
    contactNumber: d.contactNumber,
    experienceYears: d.experienceYears == null ? '' : String(d.experienceYears),
  }
}

export function DoctorProfileForm({
  doctor,
  onSubmit,
  submitLabel,
  emailLocked,
  extra,
}: {
  doctor: Doctor
  onSubmit: (values: DoctorProfileInput) => Promise<void>
  submitLabel: string
  emailLocked?: boolean
  extra?: ReactNode
}) {
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<DoctorProfileInput>({ resolver: zodResolver(doctorProfileSchema), defaultValues: doctorToForm(doctor) })

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values)
    } catch (err) {
      if (!applyServerErrors(err, setError)) throw err
    }
  })

  return (
    <form onSubmit={submit} noValidate>
      <FormSection title="About you" description="Shown in the header and printed on every prescription.">
        <Field label="Full name" required error={errors.fullName?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.fullName} placeholder="Dr. Firstname Lastname" {...register('fullName')} />}
        </Field>
        <Field label="Email" required error={errors.email?.message} hint={emailLocked ? 'Managed by your sign-in provider' : undefined}>
          {(id, d) => <Input id={id} aria-describedby={d} type="email" readOnly={emailLocked} invalid={!!errors.email} {...register('email')} />}
        </Field>
        <Field label="Specialization" required error={errors.specialization?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.specialization} placeholder="General Physician" {...register('specialization')} />}
        </Field>
        <Field label="Qualifications" required error={errors.qualifications?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.qualifications} placeholder="MBBS, MD" {...register('qualifications')} />}
        </Field>
        <Field label="Medical registration number" required error={errors.registrationNumber?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.registrationNumber} {...register('registrationNumber')} />}
        </Field>
        <Field label="Years of experience" error={errors.experienceYears?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} inputMode="numeric" invalid={!!errors.experienceYears} {...register('experienceYears')} />}
        </Field>
      </FormSection>
      <FormSection title="Clinic" description="Used for the prescription letterhead.">
        <Field label="Clinic name" required error={errors.clinicName?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} invalid={!!errors.clinicName} {...register('clinicName')} />}
        </Field>
        <Field label="Contact number" error={errors.contactNumber?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} type="tel" invalid={!!errors.contactNumber} placeholder="+91 …" {...register('contactNumber')} />}
        </Field>
        <Field label="Clinic address" error={errors.clinicAddress?.message} className="sm:col-span-2">
          {(id, d) => <Textarea id={id} aria-describedby={d} rows={2} invalid={!!errors.clinicAddress} {...register('clinicAddress')} />}
        </Field>
      </FormSection>
      {extra}
      <div className="flex justify-end pt-4">
        <Button type="submit" loading={isSubmitting} disabled={!isDirty && doctor.onboardingComplete}>
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}

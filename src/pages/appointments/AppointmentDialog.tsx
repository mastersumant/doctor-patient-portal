import { zodResolver } from '@hookform/resolvers/zod'
import { Ban, CalendarCheck, Check, Stethoscope, Trash2, TriangleAlert, UserX } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { Link } from 'react-router'
import { PatientPicker } from '@/components/patients/PatientPicker'
import { Button } from '@/components/ui/Button'
import { StatusBadge } from '@/components/ui/Display'
import { Field, Input, Select, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { APPOINTMENT_STATUSES, APPOINTMENT_TYPES, DEFAULT_SLOT_MINUTES } from '@/domain/constants'
import type { AppointmentStatus, AppointmentView } from '@/domain/types'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices } from '@/context/ServicesContext'
import { toInput } from '@/services/appointmentService'
import { formatDate, formatTime, minutesToTime, timeToMinutes, todayIso } from '@/utils/dates'
import { applyServerErrors } from '@/utils/forms'
import { appointmentSchema, type AppointmentInput } from '@/validations/schemas'

export interface AppointmentPreset {
  patientId?: string
  date?: string
  startTime?: string
  followUpId?: string
  type?: AppointmentInput['type']
  reason?: string
}

function nextSlot(): string {
  const d = new Date()
  const mins = Math.ceil((d.getHours() * 60 + d.getMinutes()) / DEFAULT_SLOT_MINUTES) * DEFAULT_SLOT_MINUTES
  return minutesToTime(Math.min(Math.max(mins, 9 * 60), 19 * 60))
}

export function AppointmentDialog({
  appointment,
  preset,
  onClose,
}: {
  appointment: AppointmentView | null
  preset?: AppointmentPreset
  onClose: () => void
}) {
  const services = useServices()
  const feedback = useFeedback()
  const start = preset?.startTime ?? nextSlot()
  const defaults: AppointmentInput = appointment
    ? toInput(appointment)
    : {
        patientId: preset?.patientId ?? '',
        date: preset?.date && preset.date >= todayIso() ? preset.date : todayIso(),
        startTime: start,
        endTime: minutesToTime(timeToMinutes(start) + 20),
        type: preset?.type ?? (preset?.followUpId ? 'Follow-up' : 'Consultation'),
        reason: preset?.reason ?? '',
        status: 'Scheduled',
        notes: '',
        followUpId: preset?.followUpId ?? '',
      }

  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    setError,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<AppointmentInput>({ resolver: zodResolver(appointmentSchema), defaultValues: defaults })

  const [date, startTime, endTime, status] = useWatch({ control, name: ['date', 'startTime', 'endTime', 'status'] })
  const [conflict, setConflict] = useState<AppointmentView | null>(null)

  // Keep the duration when the start time moves (until the end is edited by hand).
  const [duration] = useState(() => timeToMinutes(defaults.endTime) - timeToMinutes(defaults.startTime))
  useEffect(() => {
    if (!startTime || dirtyFields.endTime) return
    const end = timeToMinutes(startTime) + duration
    if (end < 24 * 60) setValue('endTime', minutesToTime(end))
  }, [startTime, duration, setValue, dirtyFields.endTime])

  useEffect(() => {
    let cancelled = false
    if (!date || !startTime || !endTime || endTime <= startTime || status === 'Cancelled' || status === 'No Show') {
      setConflict(null)
      return
    }
    const t = setTimeout(() => {
      services.appointments.findConflicts(date, startTime, endTime, appointment?.appointmentId).then((c) => !cancelled && setConflict(c[0] ?? null))
    }, 200)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [date, startTime, endTime, status, appointment, services])

  const submit = handleSubmit(async (values) => {
    try {
      if (appointment) await services.appointments.update(appointment.appointmentId, values)
      else await services.appointments.create(values)
      feedback.success(appointment ? 'Appointment updated' : `Booked for ${formatDate(values.date)} at ${formatTime(values.startTime)}`)
      onClose()
    } catch (err) {
      if (!applyServerErrors(err, setError)) feedback.error(err)
    }
  })

  const quickStatus = async (s: AppointmentStatus, label: string) => {
    if (!appointment) return
    try {
      await services.appointments.setStatus(appointment.appointmentId, s)
      feedback.success(label)
      onClose()
    } catch (err) {
      feedback.error(err)
    }
  }

  const remove = async () => {
    if (!appointment) return
    const ok = await feedback.confirm({
      title: 'Delete this appointment?',
      message: 'It is removed from the calendar but kept in the audit history. To keep a record that the patient cancelled, use Cancel instead.',
      confirmLabel: 'Delete appointment',
      tone: 'danger',
    })
    if (!ok) return
    try {
      await services.appointments.archive(appointment.appointmentId)
      feedback.success('Appointment deleted')
      onClose()
    } catch (err) {
      feedback.error(err)
    }
  }

  const open = appointment && (appointment.status === 'Scheduled' || appointment.status === 'Confirmed')

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={appointment ? appointment.patientName : 'New appointment'}
      description={appointment ? `${formatDate(appointment.date, 'EEEE, d MMM yyyy')}, ${formatTime(appointment.startTime)}–${formatTime(appointment.endTime)}` : undefined}
      footer={
        <>
          {appointment ? (
            <Button variant="ghost" icon={Trash2} onClick={remove} className="mr-auto">
              Delete
            </Button>
          ) : null}
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
          <Button onClick={submit} loading={isSubmitting}>
            {appointment ? 'Save changes' : 'Book appointment'}
          </Button>
        </>
      }
    >
      {appointment ? (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] bg-sunken px-3 py-2.5">
          <StatusBadge status={appointment.status} />
          <span className="mr-auto text-[13px] text-muted">{appointment.patientMobile}</span>
          {open ? (
            <>
              <Link to={`/visits/new?patientId=${appointment.patientId}&appointmentId=${appointment.appointmentId}`} className="inline-flex h-8 items-center gap-1.5 rounded-[var(--radius-control)] bg-brand-600 px-3 text-[13px] font-semibold text-white hover:bg-brand-700">
                <Stethoscope className="size-4" aria-hidden /> Start visit
              </Link>
              {appointment.status === 'Scheduled' ? (
                <Button size="sm" variant="secondary" icon={CalendarCheck} onClick={() => quickStatus('Confirmed', 'Appointment confirmed')}>
                  Confirm
                </Button>
              ) : null}
              <Button size="sm" variant="secondary" icon={Check} onClick={() => quickStatus('Completed', 'Marked completed')}>
                Complete
              </Button>
              <Button size="sm" variant="ghost" icon={UserX} onClick={() => quickStatus('No Show', 'Marked as no-show')}>
                No-show
              </Button>
              <Button size="sm" variant="ghost" icon={Ban} onClick={() => quickStatus('Cancelled', 'Appointment cancelled')}>
                Cancel
              </Button>
            </>
          ) : null}
        </div>
      ) : null}

      <form onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2">
        <Field label="Patient" required error={errors.patientId?.message} className="sm:col-span-2">
          {(id, d) => (
            <Controller
              control={control}
              name="patientId"
              render={({ field }) => <PatientPicker id={id} describedBy={d} value={field.value} onChange={field.onChange} invalid={!!errors.patientId} disabled={!!appointment} />}
            />
          )}
        </Field>
        <Field label="Date" required error={errors.date?.message}>
          {(id) => <Input id={id} type="date" invalid={!!errors.date} {...register('date')} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Start" required error={errors.startTime?.message}>
            {(id) => <Input id={id} type="time" step={300} invalid={!!errors.startTime} {...register('startTime')} />}
          </Field>
          <Field label="End" required error={errors.endTime?.message}>
            {(id) => <Input id={id} type="time" step={300} invalid={!!errors.endTime} {...register('endTime')} />}
          </Field>
        </div>
        {conflict ? (
          <p className="flex items-start gap-2 rounded-[var(--radius-control)] bg-warn-50 px-3 py-2 text-[13.5px] text-warn-700 sm:col-span-2" role="alert">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            Overlaps {conflict.patientName}, {formatTime(conflict.startTime)}–{formatTime(conflict.endTime)}. Pick a different time; overlapping bookings are not allowed.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5 sm:col-span-2">
          {[15, 20, 30, 45].map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setValue('endTime', minutesToTime(timeToMinutes(getValues('startTime')) + m), { shouldDirty: true, shouldValidate: true })}
              className="rounded-full border border-line px-3 py-1 text-[12.5px] font-semibold text-ink-soft hover:border-brand-200 hover:bg-brand-50"
            >
              {m} min
            </button>
          ))}
        </div>
        <Field label="Type">
          {(id) => <Select id={id} options={APPOINTMENT_TYPES} {...register('type')} />}
        </Field>
        <Field label="Status">
          {(id) => <Select id={id} options={APPOINTMENT_STATUSES} {...register('status')} />}
        </Field>
        <Field label="Reason for visit" className="sm:col-span-2" error={errors.reason?.message}>
          {(id) => <Input id={id} placeholder="e.g. BP review" {...register('reason')} />}
        </Field>
        <Field label="Notes" className="sm:col-span-2">
          {(id) => <Textarea id={id} rows={2} {...register('notes')} />}
        </Field>
      </form>
    </Modal>
  )
}

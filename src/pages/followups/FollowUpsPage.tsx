import { zodResolver } from '@hookform/resolvers/zod'
import { CalendarCheck, CalendarClock, CalendarPlus, Check, Plus, X } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { PatientPicker } from '@/components/patients/PatientPicker'
import { Button, IconButton } from '@/components/ui/Button'
import { Badge, EmptyState, ErrorState, PageHeader, Panel, Spinner, StatusBadge } from '@/components/ui/Display'
import { Field, Input, Textarea } from '@/components/ui/Field'
import { Modal } from '@/components/ui/Modal'
import { DataTable, Pagination, SearchInput, Segmented, Toolbar } from '@/components/ui/Table'
import type { FollowUpView } from '@/domain/types'
import { useFeedback } from '@/context/FeedbackContext'
import { useServices } from '@/context/ServicesContext'
import { useDebounced, useQuery } from '@/hooks/useQuery'
import type { FollowUpBucket } from '@/services/followUpService'
import { addDaysIso, formatDate, relativeDay, todayIso } from '@/utils/dates'
import { applyServerErrors } from '@/utils/forms'
import { followUpSchema, type FollowUpInput } from '@/validations/schemas'

export function FollowUpsPage() {
  const services = useServices()
  const feedback = useFeedback()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const bucket = (params.get('bucket') as FollowUpBucket) || 'open'
  const q = params.get('q') ?? ''
  const patientId = params.get('patient') ?? ''
  const page = Number(params.get('page') ?? 1)
  const search = useDebounced(q)
  const [adding, setAdding] = useState(false)

  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.delete('page')
    setParams(next, { replace: true })
  }

  const { data, error, loading, reload } = useQuery((s) => s.followUps.list({ bucket, search, patientId, page, pageSize: 12 }), [bucket, search, patientId, page])
  const { data: counts } = useQuery((s) => s.followUps.counts(), [])
  const { data: patientName } = useQuery((s) => (patientId ? s.patients.get(patientId, { includeArchived: true }).then((p) => p.fullName) : Promise.resolve('')), [patientId])

  const setStatus = async (f: FollowUpView, status: 'Completed' | 'Cancelled') => {
    try {
      await services.followUps.setStatus(f.followUpId, status)
      feedback.success(status === 'Completed' ? `Follow-up with ${f.patientName} marked done` : 'Follow-up dismissed')
    } catch (err) {
      feedback.error(err)
    }
  }

  return (
    <>
      <PageHeader
        title="Follow-ups"
        description="Reviews recommended at visits, plus any you add. Book an appointment straight from a follow-up."
        actions={
          <Button icon={Plus} onClick={() => setAdding(true)}>
            Add follow-up
          </Button>
        }
      />
      {patientId ? (
        <p className="mb-4 text-sm text-ink-soft">
          Showing follow-ups for <strong>{patientName || patientId}</strong>.{' '}
          <button className="font-semibold text-brand-600 hover:underline" onClick={() => set('patient', '')}>
            Show everyone
          </button>
        </p>
      ) : null}
      <Panel padded={false}>
        <Toolbar>
          <Segmented<FollowUpBucket>
            label="Show"
            value={bucket}
            onChange={(v) => set('bucket', v === 'open' ? '' : v)}
            options={[
              { value: 'open', label: 'Open', count: counts?.open },
              { value: 'overdue', label: 'Overdue', count: counts?.overdue },
              { value: 'upcoming', label: 'Upcoming' },
              { value: 'completed', label: 'Closed' },
            ]}
          />
          <SearchInput value={q} onChange={(v) => set('q', v)} placeholder="Patient or reason" className="sm:ml-auto sm:w-72" label="Search follow-ups" />
        </Toolbar>
        {error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : loading || !data ? (
          <Spinner />
        ) : (
          <>
            <DataTable<FollowUpView>
              rows={data.items}
              rowKey={(f) => f.followUpId}
              empty={
                <EmptyState
                  icon={CalendarClock}
                  title={bucket === 'overdue' ? 'Nothing overdue' : bucket === 'completed' ? 'No closed follow-ups' : 'No follow-ups'}
                  description={bucket === 'overdue' ? 'Every patient due for review has been seen or booked.' : 'Follow-ups are created when a visit records a recommended follow-up date.'}
                />
              }
              columns={[
                {
                  key: 'due',
                  header: 'Due',
                  render: (f) => (
                    <div className="whitespace-nowrap">
                      <p className="text-ink">{formatDate(f.dueDate)}</p>
                      <p className={f.isOverdue ? 'text-[12.5px] font-semibold text-danger-700' : 'text-[12.5px] text-muted'}>
                        {f.isOverdue ? `${-f.daysFromToday} days overdue` : relativeDay(f.dueDate)}
                      </p>
                    </div>
                  ),
                },
                {
                  key: 'patient',
                  header: 'Patient',
                  render: (f) => (
                    <Link to={`/patients/${f.patientId}`} className="font-semibold whitespace-nowrap text-ink hover:text-brand-700">
                      {f.patientName}
                    </Link>
                  ),
                },
                {
                  key: 'reason',
                  header: 'Reason',
                  hideBelow: 'md',
                  render: (f) => (
                    <div className="min-w-48">
                      <p className="line-clamp-2 text-[13.5px] text-ink-soft">{f.reason}</p>
                      {f.visitId ? (
                        <Link to={`/visits/${f.visitId}`} className="text-[12.5px] font-semibold text-brand-600 hover:underline">
                          From visit
                        </Link>
                      ) : null}
                    </div>
                  ),
                },
                { key: 'status', header: 'Status', render: (f) => (f.isOverdue ? <Badge tone="danger" dot>Overdue</Badge> : <StatusBadge status={f.status === 'Scheduled' ? 'Scheduled' : f.status} />) },
                {
                  key: 'actions',
                  header: <span className="sr-only">Actions</span>,
                  align: 'right',
                  render: (f) =>
                    f.status === 'Pending' ? (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => navigate(`/appointments?new=1&patientId=${f.patientId}&followUpId=${f.followUpId}&date=${f.dueDate}`)}>
                          Book
                        </Button>
                        <IconButton icon={Check} label="Mark done" onClick={() => setStatus(f, 'Completed')} />
                        <IconButton icon={X} label="Dismiss" tone="danger" onClick={() => setStatus(f, 'Cancelled')} />
                      </div>
                    ) : f.status === 'Scheduled' ? (
                      <span className="inline-flex items-center gap-1.5 text-[13px] text-muted">
                        <CalendarCheck className="size-4 text-teal-600" aria-hidden /> Appointment booked
                      </span>
                    ) : null,
                },
              ]}
            />
            <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={(p) => set('page', String(p))} noun="follow-ups" />
          </>
        )}
      </Panel>
      {adding ? <AddFollowUpModal onClose={() => setAdding(false)} presetPatient={patientId} /> : null}
    </>
  )
}

function AddFollowUpModal({ onClose, presetPatient }: { onClose: () => void; presetPatient: string }) {
  const services = useServices()
  const feedback = useFeedback()
  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<FollowUpInput>({
    resolver: zodResolver(followUpSchema),
    defaultValues: { patientId: presetPatient, visitId: '', dueDate: addDaysIso(todayIso(), 7), reason: '', status: 'Pending', notes: '' },
  })
  const submit = handleSubmit(async (values) => {
    try {
      await services.followUps.create(values)
      feedback.success('Follow-up added')
      onClose()
    } catch (err) {
      if (!applyServerErrors(err, setError)) feedback.error(err)
    }
  })
  return (
    <Modal
      open
      onClose={onClose}
      title="Add a follow-up"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={isSubmitting}>
            Add follow-up
          </Button>
        </>
      }
    >
      <form onSubmit={submit} noValidate className="grid gap-4">
        <Field label="Patient" required error={errors.patientId?.message}>
          {(id, d) => <Controller control={control} name="patientId" render={({ field }) => <PatientPicker id={id} describedBy={d} value={field.value} onChange={field.onChange} invalid={!!errors.patientId} />} />}
        </Field>
        <Field label="Due date" required error={errors.dueDate?.message}>
          {(id) => <Input id={id} type="date" invalid={!!errors.dueDate} {...register('dueDate')} />}
        </Field>
        <Field label="Reason" required error={errors.reason?.message}>
          {(id, d) => <Input id={id} aria-describedby={d} placeholder="e.g. Review blood sugar report" invalid={!!errors.reason} {...register('reason')} />}
        </Field>
        <Field label="Notes">
          {(id) => <Textarea id={id} rows={2} {...register('notes')} />}
        </Field>
      </form>
    </Modal>
  )
}

import { addDays, addMonths, addWeeks, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from 'date-fns'
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { EmptyState, ErrorState, PageHeader, Panel, Spinner, StatusBadge } from '@/components/ui/Display'
import { Select } from '@/components/ui/Field'
import { DataTable, Pagination, SearchInput, Segmented } from '@/components/ui/Table'
import { APPOINTMENT_STATUSES, CLINIC_DAY_END_HOUR, CLINIC_DAY_START_HOUR } from '@/domain/constants'
import type { AppointmentStatus, AppointmentView } from '@/domain/types'
import { useServices } from '@/context/ServicesContext'
import { useDebounced, useQuery } from '@/hooks/useQuery'
import { formatDate, formatTime, minutesToTime, parseDate, timeToMinutes, toIsoDate, todayIso } from '@/utils/dates'
import { classNames } from '@/utils/format'
import { AppointmentDialog, type AppointmentPreset } from './AppointmentDialog'

type View = 'day' | 'week' | 'month' | 'list'

const STATUS_STYLE: Record<AppointmentStatus, string> = {
  Scheduled: 'border-l-brand-500 bg-brand-50 text-brand-800',
  Confirmed: 'border-l-teal-500 bg-teal-50 text-teal-700',
  Completed: 'border-l-ok-600 bg-ok-50 text-ok-700',
  Cancelled: 'border-l-line-strong bg-sunken text-muted line-through',
  'No Show': 'border-l-danger-600 bg-danger-50 text-danger-700',
}

const HOUR_PX = 56

export default function AppointmentsPage() {
  const services = useServices()
  const [params, setParams] = useSearchParams()
  const view = (params.get('view') as View) || 'week'
  const anchor = parseDate(params.get('date')) ?? new Date()
  const [dialog, setDialog] = useState<{ appointment: AppointmentView | null; preset?: AppointmentPreset } | null>(null)

  // Deep links: ?new=1&patientId=…&followUpId=…&date=… open the booking form.
  useEffect(() => {
    if (params.get('new') !== '1') return
    setDialog({
      appointment: null,
      preset: { patientId: params.get('patientId') ?? undefined, followUpId: params.get('followUpId') ?? undefined, date: params.get('date') ?? undefined },
    })
    const next = new URLSearchParams(params)
    ;['new', 'patientId', 'followUpId'].forEach((k) => next.delete(k))
    setParams(next, { replace: true })
  }, [params, setParams])

  const setParam = (updates: Record<string, string | null>) => {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v)
      else next.delete(k)
    }
    setParams(next, { replace: true })
  }

  const range = useMemo(() => {
    if (view === 'day') return { from: toIsoDate(anchor), to: toIsoDate(anchor) }
    if (view === 'month') {
      return { from: toIsoDate(startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 })), to: toIsoDate(endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 })) }
    }
    return { from: toIsoDate(startOfWeek(anchor, { weekStartsOn: 1 })), to: toIsoDate(endOfWeek(anchor, { weekStartsOn: 1 })) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, params.get('date')])

  const { data: appts, error, reload } = useQuery((s) => (view === 'list' ? Promise.resolve([]) : s.appointments.range(range.from, range.to)), [range.from, range.to, view])

  const shift = (dir: -1 | 1) => {
    const d = view === 'day' ? addDays(anchor, dir) : view === 'month' ? addMonths(anchor, dir) : addWeeks(anchor, dir)
    setParam({ date: toIsoDate(d) })
  }

  const title =
    view === 'day'
      ? format(anchor, 'EEEE, d MMMM yyyy')
      : view === 'month'
        ? format(anchor, 'MMMM yyyy')
        : `${format(startOfWeek(anchor, { weekStartsOn: 1 }), 'd MMM')} – ${format(endOfWeek(anchor, { weekStartsOn: 1 }), 'd MMM yyyy')}`

  const openNew = (preset?: AppointmentPreset) => setDialog({ appointment: null, preset })
  const openExisting = async (a: AppointmentView) => setDialog({ appointment: await services.appointments.get(a.appointmentId) })

  return (
    <>
      <PageHeader
        title="Appointments"
        description="Click an empty slot to book it. Overlapping bookings are blocked."
        actions={
          <Button icon={CalendarPlus} onClick={() => openNew({ date: view === 'list' ? undefined : toIsoDate(anchor) })}>
            New appointment
          </Button>
        }
      />

      <Panel padded={false}>
        <div className="flex flex-col gap-3 border-b border-line px-5 py-3.5 md:flex-row md:items-center">
          <Segmented<View>
            label="Calendar view"
            value={view}
            onChange={(v) => setParam({ view: v === 'week' ? null : v })}
            options={[
              { value: 'day', label: 'Day' },
              { value: 'week', label: 'Week' },
              { value: 'month', label: 'Month' },
              { value: 'list', label: 'List' },
            ]}
          />
          {view !== 'list' ? (
            <div className="flex items-center gap-2 md:ml-auto">
              <button onClick={() => shift(-1)} className="grid size-9 place-items-center rounded-md border border-line hover:bg-sunken" aria-label="Previous">
                <ChevronLeft className="size-4" />
              </button>
              <Button size="sm" variant="secondary" onClick={() => setParam({ date: null })}>
                Today
              </Button>
              <button onClick={() => shift(1)} className="grid size-9 place-items-center rounded-md border border-line hover:bg-sunken" aria-label="Next">
                <ChevronRight className="size-4" />
              </button>
              <h2 className="ml-2 text-[15px] font-semibold whitespace-nowrap" aria-live="polite">
                {title}
              </h2>
            </div>
          ) : null}
        </div>

        {error ? (
          <div className="p-5">
            <ErrorState message={error} onRetry={reload} />
          </div>
        ) : view === 'list' ? (
          <ListView onOpen={openExisting} />
        ) : !appts ? (
          <Spinner />
        ) : view === 'month' ? (
          <MonthView anchor={anchor} appts={appts} onOpen={openExisting} onDay={(d) => setParam({ view: 'day', date: d })} />
        ) : (
          <TimeGrid
            days={view === 'day' ? [anchor] : eachDayOfInterval({ start: startOfWeek(anchor, { weekStartsOn: 1 }), end: endOfWeek(anchor, { weekStartsOn: 1 }) })}
            appts={appts}
            onOpen={openExisting}
            onSlot={(date, time) => openNew({ date, startTime: time })}
            onDay={(d) => setParam({ view: 'day', date: d })}
          />
        )}
      </Panel>

      {dialog ? <AppointmentDialog appointment={dialog.appointment} preset={dialog.preset} onClose={() => setDialog(null)} /> : null}
    </>
  )
}

function TimeGrid({
  days,
  appts,
  onOpen,
  onSlot,
  onDay,
}: {
  days: Date[]
  appts: AppointmentView[]
  onOpen: (a: AppointmentView) => void
  onSlot: (date: string, time: string) => void
  onDay: (date: string) => void
}) {
  const hours = Array.from({ length: CLINIC_DAY_END_HOUR - CLINIC_DAY_START_HOUR }, (_, i) => CLINIC_DAY_START_HOUR + i)
  const today = todayIso()
  const [nowMin, setNowMin] = useState(() => new Date().getHours() * 60 + new Date().getMinutes())
  useEffect(() => {
    const t = setInterval(() => setNowMin(new Date().getHours() * 60 + new Date().getMinutes()), 60_000)
    return () => clearInterval(t)
  }, [])
  const top = (hhmm: string) => ((timeToMinutes(hhmm) - CLINIC_DAY_START_HOUR * 60) / 60) * HOUR_PX
  const single = days.length === 1

  return (
    <div className="overflow-x-auto">
      <div className={classNames(single ? 'min-w-0' : 'min-w-[760px]')}>
        <div className="sticky top-0 z-[2] grid border-b border-line bg-surface" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div />
          {days.map((d) => {
            const iso = toIsoDate(d)
            return (
              <button key={iso} onClick={() => onDay(iso)} className="border-l border-line px-2 py-2 text-left hover:bg-sunken">
                <span className="block text-[12px] text-muted">{format(d, 'EEE')}</span>
                <span className={classNames('tabular text-[17px] font-bold', iso === today ? 'text-brand-600' : 'text-ink')}>{format(d, 'd')}</span>
              </button>
            )
          })}
        </div>
        <div className="relative grid" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
          <div>
            {hours.map((h) => (
              <div key={h} className="relative border-b border-transparent pr-2 text-right text-[11.5px] text-muted" style={{ height: HOUR_PX }}>
                <span className={classNames('relative', h === CLINIC_DAY_START_HOUR ? 'top-1' : '-top-2')}>{format(new Date(2000, 0, 1, h), 'h a')}</span>
              </div>
            ))}
          </div>
          {days.map((d) => {
            const iso = toIsoDate(d)
            const dayAppts = appts.filter((a) => a.date === iso)
            return (
              <div key={iso} className={classNames('relative border-l border-line', iso === today && 'bg-brand-50/25')}>
                {hours.map((h) =>
                  [0, 30].map((m) => (
                    <button
                      key={`${h}-${m}`}
                      type="button"
                      onClick={() => onSlot(iso, minutesToTime(h * 60 + m))}
                      className={classNames('block w-full hover:bg-brand-50/70 focus-visible:bg-brand-50', m === 0 ? 'border-t border-line' : 'border-t border-dashed border-line/60')}
                      style={{ height: HOUR_PX / 2 }}
                      aria-label={`Book ${format(d, 'EEE d MMM')} at ${formatTime(minutesToTime(h * 60 + m))}`}
                    />
                  )),
                )}
                {iso === today && nowMin >= CLINIC_DAY_START_HOUR * 60 && nowMin <= CLINIC_DAY_END_HOUR * 60 ? (
                  <div className="pointer-events-none absolute inset-x-0 z-[1] h-0.5 bg-danger-600" style={{ top: top(minutesToTime(nowMin)) }} aria-hidden>
                    <span className="absolute -top-1 -left-1 size-2.5 rounded-full bg-danger-600" />
                  </div>
                ) : null}
                {dayAppts.map((a) => {
                  const height = Math.max(22, top(a.endTime) - top(a.startTime) - 2)
                  return (
                    <button
                      key={a.appointmentId}
                      onClick={() => onOpen(a)}
                      className={classNames(
                        'absolute inset-x-1 z-[1] overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left text-[12px] leading-tight shadow-panel hover:ring-2 hover:ring-brand-200',
                        STATUS_STYLE[a.status],
                      )}
                      style={{ top: top(a.startTime) + 1, height }}
                      title={`${a.patientName}, ${formatTime(a.startTime)}–${formatTime(a.endTime)}, ${a.status}`}
                    >
                      <span className="block truncate font-semibold">{a.patientName}</span>
                      {height > 30 ? (
                        <span className="block truncate opacity-80">
                          {formatTime(a.startTime)}
                          {single ? ` – ${formatTime(a.endTime)}, ${a.type}${a.reason ? `: ${a.reason}` : ''}` : ''}
                        </span>
                      ) : null}
                    </button>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MonthView({ anchor, appts, onOpen, onDay }: { anchor: Date; appts: AppointmentView[]; onOpen: (a: AppointmentView) => void; onDay: (d: string) => void }) {
  const days = eachDayOfInterval({ start: startOfWeek(startOfMonth(anchor), { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(anchor), { weekStartsOn: 1 }) })
  const today = todayIso()
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="grid grid-cols-7 border-b border-line text-[12px] font-semibold text-muted">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className="px-2 py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d) => {
            const iso = toIsoDate(d)
            const items = appts.filter((a) => a.date === iso)
            const inMonth = isSameMonth(d, anchor)
            return (
              <div key={iso} className={classNames('min-h-28 border-r border-b border-line p-1.5 [&:nth-child(7n)]:border-r-0', !inMonth && 'bg-sunken/50')}>
                <button
                  onClick={() => onDay(iso)}
                  className={classNames(
                    'tabular mb-1 grid size-7 place-items-center rounded-full text-[13px] font-semibold hover:bg-sunken',
                    iso === today ? 'bg-brand-600 text-white hover:bg-brand-700' : inMonth ? 'text-ink' : 'text-muted',
                  )}
                  aria-label={`Open ${format(d, 'EEEE d MMMM')}`}
                >
                  {format(d, 'd')}
                </button>
                <ul className="space-y-1">
                  {items.slice(0, 3).map((a) => (
                    <li key={a.appointmentId}>
                      <button onClick={() => onOpen(a)} className={classNames('block w-full truncate rounded border-l-[3px] px-1.5 py-0.5 text-left text-[11.5px]', STATUS_STYLE[a.status])}>
                        <span className="tabular">{a.startTime}</span> {a.patientName}
                      </button>
                    </li>
                  ))}
                  {items.length > 3 ? (
                    <li>
                      <button onClick={() => onDay(iso)} className="px-1.5 text-[11.5px] font-semibold text-brand-600 hover:underline">
                        {items.length - 3} more
                      </button>
                    </li>
                  ) : null}
                </ul>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function ListView({ onOpen }: { onOpen: (a: AppointmentView) => void }) {
  const [q, setQ] = useState('')
  const [status, setStatus] = useState<AppointmentStatus | ''>('')
  const [when, setWhen] = useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [page, setPage] = useState(1)
  const search = useDebounced(q)
  const today = todayIso()
  useEffect(() => setPage(1), [search, status, when])
  const { data, loading } = useQuery(
    (s) =>
      s.appointments.list({
        search,
        status,
        from: when === 'upcoming' ? today : undefined,
        to: when === 'past' ? toIsoDate(addDays(new Date(), -1)) : undefined,
        order: when === 'past' ? 'desc' : 'asc',
        page,
        pageSize: 12,
      }),
    [search, status, when, page],
  )
  return (
    <>
      <div className="flex flex-col gap-3 border-b border-line px-5 py-3.5 sm:flex-row sm:flex-wrap sm:items-center">
        <SearchInput value={q} onChange={setQ} placeholder="Patient, mobile or reason" className="sm:w-72" label="Search appointments" />
        <Segmented<'upcoming' | 'past' | 'all'>
          label="When"
          value={when}
          onChange={setWhen}
          options={[
            { value: 'upcoming', label: 'Upcoming' },
            { value: 'past', label: 'Past' },
            { value: 'all', label: 'All' },
          ]}
        />
        <Select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as AppointmentStatus | '')} options={APPOINTMENT_STATUSES} placeholder="Any status" className="sm:ml-auto sm:w-44" />
      </div>
      {loading || !data ? (
        <Spinner />
      ) : (
        <>
          <DataTable<AppointmentView>
            rows={data.items}
            rowKey={(a) => a.appointmentId}
            onRowClick={onOpen}
            empty={<EmptyState icon={CalendarDays} title="No appointments match" />}
            columns={[
              { key: 'date', header: 'Date', render: (a) => <span className="whitespace-nowrap">{formatDate(a.date, 'EEE, d MMM yyyy')}</span> },
              { key: 'time', header: 'Time', render: (a) => <span className="tabular whitespace-nowrap">{formatTime(a.startTime)}–{formatTime(a.endTime)}</span> },
              { key: 'patient', header: 'Patient', render: (a) => <span className="font-semibold whitespace-nowrap text-ink">{a.patientName}</span> },
              { key: 'type', header: 'Type', hideBelow: 'md', render: (a) => a.type },
              { key: 'reason', header: 'Reason', hideBelow: 'lg', render: (a) => <span className="text-[13.5px] text-muted">{a.reason || '—'}</span> },
              { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
            ]}
          />
          <Pagination page={data.page} totalPages={data.totalPages} total={data.total} pageSize={data.pageSize} onPage={setPage} noun="appointments" />
        </>
      )}
    </>
  )
}

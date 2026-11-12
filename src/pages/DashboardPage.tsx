import {
  CalendarClock,
  CalendarDays,
  CalendarPlus,
  ClipboardList,
  ClipboardPlus,
  Stethoscope,
  UserPlus,
  Users,
} from 'lucide-react'
import { format } from 'date-fns'
import { Link } from 'react-router'
import { ColumnChart, RankedBars, StackedColumnChart } from '@/components/charts/Charts'
import { ButtonLink } from '@/components/ui/Button'
import { Avatar, Badge, EmptyState, ErrorState, PageHeader, Panel, Spinner, StatusBadge } from '@/components/ui/Display'
import { StatStrip } from '@/components/ui/StatStrip'
import { useWorkspace } from '@/context/ServicesContext'
import { useQuery } from '@/hooks/useQuery'
import { formatDate, formatTime, relativeDay } from '@/utils/dates'

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export function DashboardPage() {
  const { doctor } = useWorkspace()
  const { data, error, loading, reload } = useQuery((s) => s.analytics.dashboard(), [])
  const surname = doctor?.fullName.replace(/^dr\.?\s+/i, '').split(' ').slice(-1)[0] ?? ''

  return (
    <>
      <PageHeader
        title={`${greeting()}, Dr. ${surname}`}
        description={format(new Date(), 'EEEE, d MMMM yyyy')}
        actions={
          <>
            <ButtonLink to="/patients/new" variant="secondary" icon={UserPlus}>
              Add patient
            </ButtonLink>
            <ButtonLink to="/appointments?new=1" variant="secondary" icon={CalendarPlus}>
              Schedule appointment
            </ButtonLink>
            <ButtonLink to="/prescriptions/new" variant="secondary" icon={ClipboardPlus}>
              Create prescription
            </ButtonLink>
            <ButtonLink to="/visits/new" icon={Stethoscope}>
              Record visit
            </ButtonLink>
          </>
        }
      />

      {error ? <ErrorState message={error} onRetry={reload} /> : null}
      {loading || !data ? (
        <Spinner />
      ) : (
        <div className="space-y-6">
          <StatStrip
            stats={[
              { label: 'Total patients', value: data.cards.totalPatients, icon: Users, to: '/patients', detail: 'Active and inactive' },
              { label: 'New this month', value: data.cards.newPatientsThisMonth, icon: UserPlus, to: '/patients?sort=newest', detail: format(new Date(), 'MMMM') },
              {
                label: 'Today’s appointments',
                value: data.cards.todaysAppointments,
                icon: CalendarDays,
                to: '/appointments',
                detail: data.upcomingAppointments.length ? `${data.upcomingAppointments.length} more coming up` : 'Nothing else booked',
              },
              { label: 'Total visits', value: data.cards.totalVisits, icon: Stethoscope, to: '/visits', detail: `${data.cards.visitsThisMonth} this month` },
              {
                label: 'Pending follow-ups',
                value: data.cards.pendingFollowUps,
                icon: CalendarClock,
                to: data.cards.overdueFollowUps ? '/follow-ups?bucket=overdue' : '/follow-ups',
                detail: data.cards.overdueFollowUps ? `${data.cards.overdueFollowUps} overdue` : 'None overdue',
                alert: data.cards.overdueFollowUps > 0,
              },
              { label: 'Prescriptions issued', value: data.cards.prescriptionsIssued, icon: ClipboardList, to: '/prescriptions', detail: `${data.cards.prescriptionsThisMonth} this month` },
            ]}
          />

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel
              className="xl:col-span-2"
              title="Today’s appointments"
              actions={
                <Link to="/appointments" className="text-[13px] font-semibold text-brand-600 hover:underline">
                  Open calendar
                </Link>
              }
              padded={false}
            >
              {data.todaysAppointments.length === 0 ? (
                <EmptyState compact icon={CalendarDays} title="No appointments today" action={<ButtonLink to="/appointments?new=1" size="sm" icon={CalendarPlus}>Schedule one</ButtonLink>} />
              ) : (
                <ol className="divide-y divide-line">
                  {data.todaysAppointments.map((a) => (
                    <li key={a.appointmentId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                      <div className="tabular w-[4.5rem] text-[15px] font-semibold text-ink">{formatTime(a.startTime)}</div>
                      <div className="min-w-0 flex-1">
                        <Link to={`/patients/${a.patientId}`} className="font-semibold text-ink hover:text-brand-700">
                          {a.patientName}
                        </Link>
                        <p className="truncate text-[13px] text-muted">
                          {a.type}
                          {a.reason ? `: ${a.reason}` : ''}
                        </p>
                      </div>
                      <StatusBadge status={a.status} />
                      {a.status === 'Scheduled' || a.status === 'Confirmed' ? (
                        <ButtonLink to={`/visits/new?patientId=${a.patientId}&appointmentId=${a.appointmentId}`} size="sm" variant="secondary" icon={Stethoscope}>
                          Start visit
                        </ButtonLink>
                      ) : null}
                    </li>
                  ))}
                </ol>
              )}
            </Panel>

            <Panel
              title="Follow-ups due"
              actions={
                <Link to="/follow-ups" className="text-[13px] font-semibold text-brand-600 hover:underline">
                  View all
                </Link>
              }
              padded={false}
            >
              {data.followUpsDue.length === 0 ? (
                <EmptyState compact icon={CalendarClock} title="No follow-ups pending" />
              ) : (
                <ul className="divide-y divide-line">
                  {data.followUpsDue.map((f) => (
                    <li key={f.followUpId} className="px-5 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <Link to={`/patients/${f.patientId}`} className="font-semibold text-ink hover:text-brand-700">
                          {f.patientName}
                        </Link>
                        {f.isOverdue ? <Badge tone="danger">{-f.daysFromToday}d overdue</Badge> : f.status === 'Scheduled' ? <Badge tone="brand">Booked</Badge> : <Badge tone="warn">{relativeDay(f.dueDate)}</Badge>}
                      </div>
                      <p className="mt-0.5 line-clamp-1 text-[13px] text-muted">{f.reason}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel title="Patient registrations" description="New patients per month, last 6 months">
              <ColumnChart data={data.registrationTrend} caption="New patients per month" valueLabel="New patients" />
            </Panel>
            <Panel title="Monthly visits" description="By visit type, last 6 months">
              <StackedColumnChart data={data.visitsByMonth} keys={['New Consultation', 'Follow-up', 'Emergency'] as const} caption="Visits per month by type" />
            </Panel>
            <Panel title="Commonly diagnosed" description="All recorded diagnoses">
              <RankedBars data={data.topDiagnoses} caption="Most common diagnoses" unit="diagnoses" />
            </Panel>
            <Panel title="Appointment statistics" description="Past and next 30 days, by status">
              <RankedBars data={data.appointmentStats} caption="Appointments by status" unit="appointments" />
            </Panel>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <Panel title="Recently added patients" padded={false} actions={<Link to="/patients" className="text-[13px] font-semibold text-brand-600 hover:underline">All patients</Link>}>
              {data.recentPatients.length === 0 ? (
                <EmptyState compact icon={Users} title="No patients yet" action={<ButtonLink to="/patients/new" size="sm" icon={UserPlus}>Add patient</ButtonLink>} />
              ) : (
                <ul className="divide-y divide-line">
                  {data.recentPatients.map((p) => (
                    <li key={p.patientId}>
                      <Link to={`/patients/${p.patientId}`} className="flex items-center gap-3 px-5 py-3 hover:bg-brand-50/40">
                        <Avatar name={p.fullName} size={34} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-ink">{p.fullName}</span>
                          <span className="block text-[13px] text-muted">
                            {p.age} y, {p.gender}
                          </span>
                        </span>
                        <span className="text-[12.5px] text-muted">{formatDate(p.registrationDate, 'd MMM')}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Recent prescriptions" padded={false} actions={<Link to="/prescriptions" className="text-[13px] font-semibold text-brand-600 hover:underline">All prescriptions</Link>}>
              {data.recentPrescriptions.length === 0 ? (
                <EmptyState compact icon={ClipboardList} title="No prescriptions yet" />
              ) : (
                <ul className="divide-y divide-line">
                  {data.recentPrescriptions.map((r) => (
                    <li key={r.prescriptionId}>
                      <Link to={`/prescriptions/${r.prescriptionId}`} className="block px-5 py-3 hover:bg-brand-50/40">
                        <div className="flex items-center justify-between gap-3">
                          <span className="truncate font-semibold text-ink">{r.snapshot.patientName}</span>
                          <span className="tabular text-[12.5px] text-muted">{formatDate(r.prescriptionDate, 'd MMM')}</span>
                        </div>
                        <p className="truncate text-[13px] text-muted">
                          {r.rxNumber}
                          {r.version > 1 ? ` v${r.version}` : ''}, {r.itemCount} medicine{r.itemCount === 1 ? '' : 's'}
                          {r.diagnosis ? `, ${r.diagnosis}` : ''}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Upcoming appointments" padded={false} actions={<Link to="/appointments" className="text-[13px] font-semibold text-brand-600 hover:underline">Calendar</Link>}>
              {data.upcomingAppointments.length === 0 ? (
                <EmptyState compact icon={CalendarDays} title="Nothing booked after today" />
              ) : (
                <ul className="divide-y divide-line">
                  {data.upcomingAppointments.map((a) => (
                    <li key={a.appointmentId} className="flex items-center gap-3 px-5 py-3">
                      <div className="w-12 shrink-0 rounded-md bg-sunken py-1 text-center leading-tight">
                        <span className="block text-[11px] text-muted">{formatDate(a.date, 'MMM')}</span>
                        <span className="tabular block text-[17px] font-bold text-ink">{formatDate(a.date, 'd')}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <Link to={`/patients/${a.patientId}`} className="block truncate font-semibold text-ink hover:text-brand-700">
                          {a.patientName}
                        </Link>
                        <p className="truncate text-[13px] text-muted">
                          {formatTime(a.startTime)}, {a.type}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}

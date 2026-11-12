import {
  Bell,
  CalendarClock,
  CalendarDays,
  ChartColumn,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  Menu,
  Pill,
  Settings,
  Stethoscope,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { useAuthState } from '@/auth/AuthContext'
import { Avatar } from '@/components/ui/Display'
import { Autocomplete } from '@/components/ui/Autocomplete'
import { env } from '@/config/env'
import { useServices, useServicesState, useWorkspace } from '@/context/ServicesContext'
import { useQuery } from '@/hooks/useQuery'
import type { PatientOption } from '@/services/patientService'
import { classNames } from '@/utils/format'
import { BrandMark } from '@/components/BrandMark'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

const NAV: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/patients', label: 'Patients', icon: Users },
  { to: '/appointments', label: 'Appointments', icon: CalendarDays },
  { to: '/visits', label: 'Visits', icon: Stethoscope },
  { to: '/prescriptions', label: 'Prescriptions', icon: ClipboardList },
  { to: '/medicines', label: 'Medicines', icon: Pill },
  { to: '/follow-ups', label: 'Follow-ups', icon: CalendarClock },
  { to: '/reports', label: 'Reports', icon: ChartColumn },
  { to: '/settings', label: 'Settings', icon: Settings },
]

function Sidebar({ onNavigate, overdue }: { onNavigate?: () => void; overdue: number }) {
  const { doctor } = useWorkspace()
  return (
    <nav aria-label="Main" className="flex h-full flex-col">
      <Link to="/" onClick={onNavigate} className="flex items-center gap-2.5 px-5 pt-5 pb-6">
        <BrandMark />
        <span className="text-[17px] font-bold tracking-[-0.01em] text-ink">{env.appName}</span>
      </Link>
      <ul className="flex-1 space-y-0.5 px-3">
        {NAV.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                classNames(
                  'relative flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-[14.5px] font-semibold transition-colors',
                  isActive
                    ? 'bg-brand-50 text-brand-700 before:absolute before:inset-y-1.5 before:-left-3 before:w-[3px] before:rounded-r before:bg-teal-500'
                    : 'text-ink-soft hover:bg-sunken hover:text-ink',
                )
              }
            >
              <item.icon className="size-[18px]" aria-hidden />
              <span className="flex-1">{item.label}</span>
              {item.to === '/follow-ups' && overdue > 0 ? (
                <span className="tabular rounded-full bg-danger-50 px-1.5 text-[12px] text-danger-700" title={`${overdue} overdue`}>
                  {overdue}
                </span>
              ) : null}
            </NavLink>
          </li>
        ))}
      </ul>
      {doctor?.clinicName ? (
        <div className="mx-3 mb-4 rounded-[var(--radius-control)] bg-sunken px-3 py-2.5">
          <p className="truncate text-[13px] font-semibold text-ink">{doctor.clinicName}</p>
          <p className="truncate text-[12px] text-muted">{doctor.specialization}</p>
        </div>
      ) : null}
    </nav>
  )
}

function GlobalSearch() {
  const services = useServices()
  const navigate = useNavigate()
  const [text, setText] = useState('')
  return (
    <div className="w-full max-w-md">
      <label htmlFor="global-search" className="sr-only">
        Find a patient
      </label>
      <Autocomplete<PatientOption>
        id="global-search"
        value={text}
        onChange={setText}
        placeholder="Find a patient"
        fetchItems={(term) => (term.trim() ? services.patients.search(term, 7) : Promise.resolve([]))}
        itemKey={(p) => p.patientId}
        emptyText={text.trim() ? 'No patients match' : 'Start typing to search'}
        onPick={(p) => {
          setText('')
          navigate(`/patients/${p.patientId}`)
        }}
        renderItem={(p) => (
          <div className="flex items-center gap-3">
            <Avatar name={p.fullName} size={28} />
            <div className="min-w-0">
              <p className="truncate font-semibold text-ink">{p.fullName}</p>
              <p className="tabular text-[12.5px] text-muted">
                {p.patientId}, {p.mobile}
              </p>
            </div>
          </div>
        )}
      />
    </div>
  )
}

function Popover({ button, children, label }: { button: (open: boolean, toggle: () => void) => React.ReactNode; children: (close: () => void) => React.ReactNode; label: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])
  return (
    <div ref={ref} className="relative">
      {button(open, () => setOpen((o) => !o))}
      {open ? (
        <div role="dialog" aria-label={label} className="absolute right-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-[var(--radius-panel)] border border-line bg-surface shadow-pop">
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  )
}

function Notifications() {
  const navigate = useNavigate()
  const { data = [] } = useQuery((s) => s.analytics.notifications(), [])
  const urgent = data.filter((n) => n.tone === 'danger').length
  return (
    <Popover
      label="Notifications"
      button={(open, toggle) => (
        <button
          onClick={toggle}
          aria-expanded={open}
          aria-label={`Notifications${data.length ? `, ${data.length} items` : ''}`}
          className="relative grid size-10 place-items-center rounded-[var(--radius-control)] text-ink-soft hover:bg-sunken hover:text-ink"
        >
          <Bell className="size-5" aria-hidden />
          {data.length ? (
            <span className={classNames('absolute top-1.5 right-1.5 grid min-w-4 place-items-center rounded-full px-1 text-[10.5px] font-bold text-white', urgent ? 'bg-danger-600' : 'bg-brand-600')}>
              {data.length}
            </span>
          ) : null}
        </button>
      )}
    >
      {(close) => (
        <div>
          <p className="border-b border-line px-4 py-3 text-sm font-semibold">Needs attention</p>
          {data.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">Nothing overdue and no more appointments today.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-line overflow-y-auto">
              {data.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => {
                      close()
                      navigate(n.link)
                    }}
                    className="flex w-full gap-3 px-4 py-3 text-left hover:bg-sunken"
                  >
                    <span className={classNames('mt-1.5 size-2 shrink-0 rounded-full', n.tone === 'danger' ? 'bg-danger-600' : 'bg-brand-500')} aria-hidden />
                    <span>
                      <span className="block text-sm font-semibold text-ink">{n.title}</span>
                      <span className="block text-[13px] text-muted">{n.detail}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Popover>
  )
}

function ProfileMenu() {
  const { doctor } = useWorkspace()
  const { signOut, identity, mode } = useAuthState()
  const navigate = useNavigate()
  const name = doctor?.fullName || identity?.fullName || 'Doctor'
  return (
    <Popover
      label="Account"
      button={(open, toggle) => (
        <button onClick={toggle} aria-expanded={open} className="flex items-center gap-2.5 rounded-[var(--radius-control)] py-1 pr-2 pl-1 hover:bg-sunken">
          <Avatar name={name} src={doctor?.avatarUrl || identity?.imageUrl} size={34} />
          <span className="hidden text-left leading-tight lg:block">
            <span className="block max-w-40 truncate text-sm font-semibold text-ink">{name}</span>
            <span className="block max-w-40 truncate text-[12px] text-muted">{doctor?.specialization || 'Complete your profile'}</span>
          </span>
        </button>
      )}
    >
      {(close) => (
        <div className="py-1">
          <div className="border-b border-line px-4 py-3">
            <p className="truncate text-sm font-semibold">{name}</p>
            <p className="truncate text-[13px] text-muted">{doctor?.email || identity?.email}</p>
            {mode === 'demo' ? <p className="mt-1 text-[12px] text-warn-700">Demo workspace, not signed in</p> : null}
          </div>
          <button
            onClick={() => {
              close()
              navigate('/settings')
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm hover:bg-sunken"
          >
            <Settings className="size-4 text-muted" aria-hidden /> Profile and settings
          </button>
          <button
            onClick={async () => {
              close()
              await signOut()
              navigate('/sign-in')
            }}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-danger-700 hover:bg-danger-50"
          >
            <LogOut className="size-4" aria-hidden /> {mode === 'demo' ? 'Leave demo workspace' : 'Sign out'}
          </button>
        </div>
      )}
    </Popover>
  )
}

export function AppLayout() {
  const [drawer, setDrawer] = useState(false)
  const location = useLocation()
  const { mode } = useAuthState()
  const { ephemeral } = useServicesState()
  const { data: counts } = useQuery((s) => s.followUps.counts(), [])

  useEffect(() => setDrawer(false), [location.pathname])
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <div className="min-h-screen">
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-line bg-surface lg:block">
        <Sidebar overdue={counts?.overdue ?? 0} />
      </aside>

      {drawer ? (
        <div className="no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-ink/40" onClick={() => setDrawer(false)} aria-hidden />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-surface shadow-pop">
            <button onClick={() => setDrawer(false)} className="absolute top-4 right-3 grid size-9 place-items-center rounded-md text-muted hover:bg-sunken" aria-label="Close menu">
              <X className="size-5" />
            </button>
            <Sidebar onNavigate={() => setDrawer(false)} overdue={counts?.overdue ?? 0} />
          </aside>
        </div>
      ) : null}

      <div className="lg:pl-64">
        {mode === 'demo' || ephemeral ? (
        <div className="no-print border-b border-warn-100 bg-warn-50 px-4 py-2 text-center text-[13px] text-warn-700">
          {mode === 'demo' ? (
            <>
              Demo workspace with synthetic data. You are not signed in.{' '}
              {env.clerkEnabled ? null : <span className="hidden sm:inline">Add a Clerk key to turn on Google and Facebook sign-in.</span>}
            </>
          ) : null}
          {ephemeral ? <> This browser blocked local storage, so changes last only until you close the tab.</> : null}
        </div>
      ) : null}

        <header className="no-print sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setDrawer(true)} className="grid size-10 place-items-center rounded-md text-ink-soft hover:bg-sunken lg:hidden" aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <GlobalSearch />
          </div>
          <Notifications />
          <ProfileMenu />
        </header>
        <main className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

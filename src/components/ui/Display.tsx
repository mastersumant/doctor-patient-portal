import { Loader2, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { classNames, initials } from '@/utils/format'

/* ---------------- Panel ---------------- */

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  padded = true,
  as: Tag = 'section',
}: {
  title?: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  padded?: boolean
  as?: 'section' | 'div'
}) {
  return (
    <Tag className={classNames('rounded-[var(--radius-panel)] border border-line bg-surface shadow-panel', className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title ? <h2 className="text-[15px] font-semibold text-ink">{title}</h2> : null}
            {description ? <p className="text-[13px] text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={padded ? 'p-5' : ''}>{children}</div>
    </Tag>
  )
}

/* ---------------- Page header ---------------- */

export function PageHeader({ title, description, actions, back }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="text-2xl leading-tight font-bold tracking-[-0.01em] text-ink sm:text-[26px]">{title}</h1>
        {description ? <p className="mt-1 max-w-2xl text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  )
}

/* ---------------- Badge ---------------- */

export type Tone = 'neutral' | 'brand' | 'teal' | 'ok' | 'warn' | 'danger'

const toneClass: Record<Tone, string> = {
  neutral: 'bg-sunken text-ink-soft',
  brand: 'bg-brand-50 text-brand-700',
  teal: 'bg-teal-50 text-teal-700',
  ok: 'bg-ok-50 text-ok-700',
  warn: 'bg-warn-50 text-warn-700',
  danger: 'bg-danger-50 text-danger-700',
}

export function Badge({ tone = 'neutral', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={classNames('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[12.5px] font-semibold whitespace-nowrap', toneClass[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" aria-hidden /> : null}
      {children}
    </span>
  )
}

const STATUS_TONES: Record<string, Tone> = {
  Active: 'ok',
  Inactive: 'neutral',
  Scheduled: 'brand',
  Confirmed: 'teal',
  Completed: 'ok',
  Cancelled: 'neutral',
  'No Show': 'danger',
  Pending: 'warn',
  Overdue: 'danger',
  Issued: 'ok',
  Superseded: 'neutral',
  Resolved: 'ok',
  Chronic: 'brand',
  Mild: 'ok',
  Moderate: 'warn',
  Severe: 'danger',
  'New Consultation': 'brand',
  'Follow-up': 'teal',
  Emergency: 'danger',
  Archived: 'neutral',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge tone={STATUS_TONES[status] ?? 'neutral'} dot>
      {status}
    </Badge>
  )
}

/* ---------------- States ---------------- */

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted" role="status">
      <Loader2 className="size-4 animate-spin" aria-hidden />
      {label}
    </div>
  )
}

export function PageLoader() {
  return (
    <div className="grid min-h-[50vh] place-items-center">
      <Spinner />
    </div>
  )
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon: LucideIcon
  title: string
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
}) {
  return (
    <div className={classNames('flex flex-col items-center text-center', compact ? 'px-4 py-8' : 'px-6 py-14')}>
      <div className="grid size-11 place-items-center rounded-full bg-brand-50 text-brand-600">
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="mt-3 font-semibold text-ink">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-[var(--radius-panel)] border border-danger-100 bg-danger-50 px-5 py-4 text-sm text-danger-700" role="alert">
      <p className="font-semibold">This couldn’t be loaded</p>
      <p className="mt-0.5">{message}</p>
      {onRetry ? (
        <button onClick={onRetry} className="mt-2 font-semibold underline underline-offset-2">
          Try again
        </button>
      ) : null}
    </div>
  )
}

/* ---------------- Avatar ---------------- */

const AVATAR_TINTS = ['bg-brand-100 text-brand-800', 'bg-teal-100 text-teal-700', 'bg-ok-100 text-ok-700', 'bg-warn-100 text-warn-700']

export function Avatar({
  name,
  src,
  blob,
  size = 36,
  className,
}: {
  name: string
  src?: string | null
  blob?: Blob | null
  size?: number
  className?: string
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!blob) {
      setBlobUrl(null)
      return
    }
    const url = URL.createObjectURL(blob)
    setBlobUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [blob])
  const url = blobUrl ?? (src && !failed ? src : null)
  const tint = AVATAR_TINTS[name.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_TINTS.length]
  return (
    <span
      className={classNames('inline-grid shrink-0 place-items-center overflow-hidden rounded-full font-semibold', !url && tint, className)}
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.38) }}
      aria-hidden
    >
      {url ? <img src={url} alt="" className="size-full object-cover" onError={() => setFailed(true)} /> : initials(name)}
    </span>
  )
}

/* ---------------- Key/value ---------------- */

export function DataList({ items, columns = 2 }: { items: Array<{ label: string; value: ReactNode }>; columns?: 1 | 2 | 3 }) {
  const cols = { 1: '', 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3' }[columns]
  return (
    <dl className={classNames('grid gap-x-8 gap-y-4', cols)}>
      {items.map((it) => (
        <div key={it.label} className="min-w-0">
          <dt className="text-[13px] text-muted">{it.label}</dt>
          <dd className="mt-0.5 text-[15px] break-words text-ink">{it.value === '' || it.value == null ? <span className="text-muted">—</span> : it.value}</dd>
        </div>
      ))}
    </dl>
  )
}

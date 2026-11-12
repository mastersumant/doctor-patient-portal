import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import { classNames } from '@/utils/format'

export interface Stat {
  label: string
  value: number | string
  icon: LucideIcon
  detail?: ReactNode
  to?: string
  alert?: boolean
}

/** One panel split into cells, rather than a row of separate floating cards. */
export function StatStrip({ stats }: { stats: Stat[] }) {
  return (
    <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-panel)] border border-line bg-line shadow-panel md:grid-cols-3 xl:grid-cols-6" style={{ gap: 1 }}>
      {stats.map((s) => {
        const body = (
          <>
            <div className="flex items-center gap-2 text-[13px] font-semibold text-muted">
              <s.icon className={classNames('size-4', s.alert ? 'text-danger-600' : 'text-teal-600')} aria-hidden />
              {s.label}
            </div>
            <p className="tabular mt-2 text-[28px] leading-none font-bold tracking-[-0.02em] text-ink">{s.value}</p>
            {s.detail ? <p className={classNames('mt-1.5 text-[12.5px]', s.alert ? 'font-semibold text-danger-700' : 'text-muted')}>{s.detail}</p> : null}
          </>
        )
        return s.to ? (
          <Link key={s.label} to={s.to} className="bg-surface px-4 py-4 transition-colors hover:bg-brand-50/40 sm:px-5">
            {body}
          </Link>
        ) : (
          <div key={s.label} className="bg-surface px-4 py-4 sm:px-5">
            {body}
          </div>
        )
      })}
    </div>
  )
}

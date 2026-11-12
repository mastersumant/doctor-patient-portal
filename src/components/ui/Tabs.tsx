import type { ReactNode } from 'react'
import { classNames } from '@/utils/format'

export interface TabDef {
  id: string
  label: string
  count?: number
}

/** Underline tabs that scroll horizontally on small screens. */
export function Tabs({ tabs, active, onChange, label }: { tabs: TabDef[]; active: string; onChange: (id: string) => void; label: string }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <div role="tablist" aria-label={label} className="flex min-w-max gap-1 border-b border-line px-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={active === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => onChange(t.id)}
            className={classNames(
              '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors',
              active === t.id ? 'border-brand-600 text-brand-700' : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {t.label}
            {t.count !== undefined ? (
              <span className={classNames('tabular rounded-full px-1.5 text-[12px]', active === t.id ? 'bg-brand-50 text-brand-700' : 'bg-sunken text-muted')}>
                {t.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}

export function TabPanel({ id, active, children }: { id: string; active: string; children: ReactNode }) {
  if (id !== active) return null
  return (
    <div role="tabpanel" id={`panel-${id}`} aria-labelledby={`tab-${id}`} className="pt-5">
      {children}
    </div>
  )
}

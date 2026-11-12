import { ChevronLeft, ChevronRight, Search, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { classNames } from '@/utils/format'

export interface Column<T> {
  key: string
  header: ReactNode
  render: (row: T) => ReactNode
  className?: string
  /** Hide on narrow screens to keep the table readable on phones. */
  hideBelow?: 'sm' | 'md' | 'lg'
  align?: 'left' | 'right'
}

const hide = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' }

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty,
  dense,
}: {
  columns: Array<Column<T>>
  rows: T[]
  rowKey: (row: T) => string
  onRowClick?: (row: T) => void
  empty?: ReactNode
  dense?: boolean
}) {
  if (rows.length === 0 && empty) return <>{empty}</>
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-line bg-sunken/60">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={classNames(
                  'px-4 py-2.5 text-[12.5px] font-semibold whitespace-nowrap text-muted first:pl-5 last:pr-5',
                  c.hideBelow && hide[c.hideBelow],
                  c.align === 'right' && 'text-right',
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={classNames('border-b border-line last:border-b-0', onRowClick && 'cursor-pointer hover:bg-brand-50/50')}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={classNames(
                    'px-4 align-middle first:pl-5 last:pr-5',
                    dense ? 'py-2' : 'py-3',
                    c.hideBelow && hide[c.hideBelow],
                    c.align === 'right' && 'text-right',
                    c.className,
                  )}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Pagination({
  page,
  totalPages,
  total,
  pageSize,
  onPage,
  noun = 'records',
}: {
  page: number
  totalPages: number
  total: number
  pageSize: number
  onPage: (p: number) => void
  noun?: string
}) {
  if (total === 0) return null
  const from = (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-[13px] text-muted">
      <span className="tabular">
        {from}–{to} of {total} {noun}
      </span>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 font-semibold text-ink-soft hover:bg-sunken disabled:opacity-40"
        >
          <ChevronLeft className="size-4" aria-hidden /> Previous
        </button>
        <span className="tabular px-2">
          Page {page} of {totalPages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="inline-flex h-8 items-center gap-1 rounded-md px-2.5 font-semibold text-ink-soft hover:bg-sunken disabled:opacity-40"
        >
          Next <ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}

export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  label = 'Search',
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  className?: string
  label?: string
}) {
  return (
    <div className={classNames('relative', className)}>
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" aria-hidden />
      <input
        type="search"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-10 w-full rounded-[var(--radius-control)] border border-line-strong bg-surface pr-9 pl-9 text-[15px] placeholder:text-muted/80 focus:border-brand-500 focus:ring-3 focus:ring-brand-100 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button onClick={() => onChange('')} className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded text-muted hover:text-ink" aria-label="Clear search">
          <X className="size-3.5" />
        </button>
      ) : null}
    </div>
  )
}

/** Toolbar row above a table: search on the left, filters on the right. */
export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-3 border-b border-line px-5 py-3.5 sm:flex-row sm:flex-wrap sm:items-center">{children}</div>
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: string; count?: number }>
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-[var(--radius-control)] bg-sunken p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={classNames(
            'inline-flex h-8 items-center gap-1.5 rounded-[7px] px-3 text-[13px] font-semibold transition-colors',
            value === o.value ? 'bg-surface text-ink shadow-panel' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
          {o.count !== undefined ? (
            <span className={classNames('tabular rounded-full px-1.5 text-[11.5px]', value === o.value ? 'bg-brand-50 text-brand-700' : 'bg-line/70')}>{o.count}</span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

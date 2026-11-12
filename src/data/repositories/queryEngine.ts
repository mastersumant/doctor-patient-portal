/**
 * Evaluates a storage-agnostic ListQuery against in-memory rows. Shared by the
 * IndexedDB and in-memory repositories. A SQL repository would translate the
 * same query object into WHERE / ORDER BY / LIMIT / OFFSET instead.
 */
import type { FilterValue, ListQuery, Page } from './interfaces'

function matchesFilter(value: unknown, filter: FilterValue): boolean {
  if (filter === null || typeof filter !== 'object') return value === filter
  const v = value as string | number | null | undefined
  if (filter.eq !== undefined && v !== filter.eq) return false
  if (filter.ne !== undefined && v === filter.ne) return false
  if (filter.in !== undefined && !filter.in.includes(v as never)) return false
  if (filter.isNull !== undefined && (v === null || v === undefined || v === '') !== filter.isNull) return false
  if (filter.gte !== undefined && (v == null || v === '' || v < filter.gte)) return false
  if (filter.lte !== undefined && (v == null || v === '' || v > filter.lte)) return false
  if (filter.gt !== undefined && (v == null || v === '' || v <= filter.gt)) return false
  if (filter.lt !== undefined && (v == null || v === '' || v >= filter.lt)) return false
  return true
}

function compare(a: unknown, b: unknown): number {
  if (a === b) return 0
  if (a === null || a === undefined || a === '') return 1 // nulls last
  if (b === null || b === undefined || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return String(a).localeCompare(String(b), undefined, { sensitivity: 'base', numeric: true })
}

export function filterRows<T>(rows: T[], query: Omit<ListQuery<T>, 'page' | 'pageSize'> = {}): T[] {
  let out = rows
  if (!query.includeDeleted) {
    out = out.filter((r) => !(r as { deletedAt?: string | null }).deletedAt)
  }
  if (query.filters) {
    const entries = Object.entries(query.filters).filter(([, f]) => f !== undefined) as Array<[string, FilterValue]>
    if (entries.length) {
      out = out.filter((row) => entries.every(([field, f]) => matchesFilter((row as Record<string, unknown>)[field], f)))
    }
  }
  const term = query.search?.term.trim().toLowerCase()
  if (term && query.search) {
    const fields = query.search.fields
    out = out.filter((row) =>
      fields.some((f) => {
        const v = (row as Record<string, unknown>)[f]
        return v !== null && v !== undefined && String(v).toLowerCase().includes(term)
      }),
    )
  }
  if (query.sort?.length) {
    const sorts = query.sort
    out = [...out].sort((a, b) => {
      for (const s of sorts) {
        const c = compare((a as Record<string, unknown>)[s.field], (b as Record<string, unknown>)[s.field])
        if (c !== 0) return s.direction === 'asc' ? c : -c
      }
      return 0
    })
  }
  return out
}

export function paginate<T>(rows: T[], page?: number, pageSize?: number): Page<T> {
  const total = rows.length
  if (!page || !pageSize) {
    return { items: rows, total, page: 1, pageSize: total || 1, totalPages: 1 }
  }
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const safePage = Math.min(Math.max(1, page), totalPages)
  const start = (safePage - 1) * pageSize
  return { items: rows.slice(start, start + pageSize), total, page: safePage, pageSize, totalPages }
}

export function runQuery<T>(rows: T[], query: ListQuery<T> = {}): Page<T> {
  return paginate(filterRows(rows, query), query.page, query.pageSize)
}

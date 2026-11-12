/**
 * Converts entities to flat spreadsheet rows and back, validating types against
 * the table spec. Pure functions: no Excel library dependency.
 */
import type { ColumnSpec, TableSpec } from './tables'

export type Cell = string | number | boolean | null

export function toRow(table: TableSpec, entity: Record<string, unknown>): Record<string, Cell> {
  const row: Record<string, Cell> = {}
  for (const col of table.columns) {
    const v = entity[col.key]
    if (v === null || v === undefined) row[col.key] = null
    else if (col.type === 'json') row[col.key] = JSON.stringify(v)
    else if (col.type === 'bool') row[col.key] = Boolean(v)
    else row[col.key] = v as Cell
  }
  return row
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

function decode(col: ColumnSpec, raw: unknown): { ok: true; value: unknown } | { ok: false; error: string } {
  const empty = raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')
  if (empty) {
    if (col.nullable) return { ok: true, value: null }
    if (col.type === 'text' || col.type === 'longtext') return { ok: true, value: '' }
    return { ok: false, error: 'is required' }
  }
  switch (col.type) {
    case 'id':
    case 'text':
    case 'longtext': {
      const s = String(raw)
      if (col.maxLength && s.length > col.maxLength) return { ok: false, error: `is longer than ${col.maxLength} characters` }
      return { ok: true, value: s }
    }
    case 'int':
    case 'decimal': {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim())
      if (!Number.isFinite(n)) return { ok: false, error: 'must be a number' }
      if (col.type === 'int' && !Number.isInteger(n)) return { ok: false, error: 'must be a whole number' }
      return { ok: true, value: n }
    }
    case 'bool': {
      if (typeof raw === 'boolean') return { ok: true, value: raw }
      const s = String(raw).trim().toLowerCase()
      if (['true', '1', 'yes'].includes(s)) return { ok: true, value: true }
      if (['false', '0', 'no'].includes(s)) return { ok: true, value: false }
      return { ok: false, error: 'must be TRUE or FALSE' }
    }
    case 'date': {
      const s = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).trim().slice(0, 10)
      return ISO_DATE.test(s) ? { ok: true, value: s } : { ok: false, error: 'must be a date as YYYY-MM-DD' }
    }
    case 'datetime': {
      const d = raw instanceof Date ? raw : new Date(String(raw))
      return Number.isNaN(d.getTime()) ? { ok: false, error: 'must be a date-time' } : { ok: true, value: d.toISOString() }
    }
    case 'time': {
      const s = String(raw).trim().slice(0, 5)
      return TIME.test(s) ? { ok: true, value: s } : { ok: false, error: 'must be a time as HH:MM' }
    }
    case 'enum': {
      const s = String(raw).trim()
      return col.enumValues?.includes(s) ? { ok: true, value: s } : { ok: false, error: `must be one of: ${col.enumValues?.join(', ')}` }
    }
    case 'bytes':
      return { ok: true, value: raw }
    case 'json': {
      if (typeof raw === 'object') return { ok: true, value: raw }
      try {
        return { ok: true, value: JSON.parse(String(raw)) }
      } catch {
        return { ok: false, error: 'must be valid JSON' }
      }
    }
  }
}

export interface DecodeResult<T> {
  rows: T[]
  errors: string[]
}

/** Decodes and validates sheet rows. Errors are reported per row/column (1-based, header = row 1). */
export function fromRows<T>(table: TableSpec, rows: Array<Record<string, unknown>>, maxErrors = 20): DecodeResult<T> {
  const out: T[] = []
  const errors: string[] = []
  const seen = new Set<string>()
  rows.forEach((raw, i) => {
    const entity: Record<string, unknown> = {}
    let rowOk = true
    for (const col of table.columns) {
      const res = decode(col, raw[col.key])
      if (res.ok) entity[col.key] = res.value
      else {
        rowOk = false
        if (errors.length < maxErrors) errors.push(`${table.label}, row ${i + 2}: ${col.key} ${res.error}`)
      }
    }
    const pk = String(entity[table.primaryKey] ?? '')
    if (rowOk && seen.has(pk)) {
      rowOk = false
      if (errors.length < maxErrors) errors.push(`${table.label}, row ${i + 2}: duplicate ${table.primaryKey} ${pk}`)
    }
    seen.add(pk)
    if (rowOk) out.push(entity as T)
  })
  return { rows: out, errors }
}

/** Every non-null foreign key must point at a row present in the import. */
export function checkReferences(tables: TableSpec[], data: Record<string, Array<Record<string, unknown>>>, maxErrors = 20): string[] {
  const keys = new Map<string, Set<string>>()
  for (const t of tables) keys.set(`${t.name}.${t.primaryKey}`, new Set((data[t.name] ?? []).map((r) => String(r[t.primaryKey]))))
  const errors: string[] = []
  for (const t of tables) {
    for (const col of t.columns) {
      if (!col.ref || col.ref === 'doctors.doctorId') continue
      const target = keys.get(col.ref)
      if (!target) continue
      for (const r of data[t.name] ?? []) {
        const v = r[col.key]
        if (v !== null && v !== undefined && v !== '' && !target.has(String(v))) {
          if (errors.length < maxErrors) errors.push(`${t.label} ${String(r[t.primaryKey])}: ${col.key} ${String(v)} does not exist`)
        }
      }
    }
  }
  return errors
}

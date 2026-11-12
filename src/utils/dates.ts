import { differenceInCalendarDays, differenceInYears, format, isValid, parseISO } from 'date-fns'

/** Local calendar date as YYYY-MM-DD (not UTC, so "today" matches the clinic's wall clock). */
export function toIsoDate(d: Date): string {
  return format(d, 'yyyy-MM-dd')
}

export function todayIso(): string {
  return toIsoDate(new Date())
}

export function nowIso(): string {
  return new Date().toISOString()
}

/** Parse a YYYY-MM-DD as a local date (parseISO already treats date-only strings as local). */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null
  const d = parseISO(value)
  return isValid(d) ? d : null
}

export function addDaysIso(iso: string, days: number): string {
  const d = parseDate(iso) ?? new Date()
  d.setDate(d.getDate() + days)
  return toIsoDate(d)
}

export function ageFromDob(dob: string, on: Date = new Date()): number {
  const d = parseDate(dob)
  return d ? Math.max(0, differenceInYears(on, d)) : 0
}

/** Human age: "4 mo" for infants, otherwise years. */
export function formatAge(dob: string): string {
  const d = parseDate(dob)
  if (!d) return '—'
  const years = differenceInYears(new Date(), d)
  if (years >= 2) return `${years} y`
  const months = Math.max(0, Math.floor(differenceInCalendarDays(new Date(), d) / 30.44))
  return months >= 1 ? `${months} mo` : `${differenceInCalendarDays(new Date(), d)} d`
}

export function daysFromToday(iso: string): number {
  const d = parseDate(iso)
  return d ? differenceInCalendarDays(d, new Date()) : 0
}

export function formatDate(value: string | null | undefined, pattern = 'd MMM yyyy'): string {
  const d = parseDate(value ?? null)
  return d ? format(d, pattern) : '—'
}

export function formatDateTime(value: string | null | undefined): string {
  const d = parseDate(value ?? null)
  return d ? format(d, 'd MMM yyyy, h:mm a') : '—'
}

/** "14:30" → "2:30 PM" */
export function formatTime(hhmm: string | null | undefined): string {
  if (!hhmm) return '—'
  const [h, m] = hhmm.split(':').map(Number)
  const d = new Date()
  d.setHours(h, m, 0, 0)
  return format(d, 'h:mm a')
}

export function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Combine a local date and time into an ISO timestamp. */
export function combineDateTime(dateIso: string, hhmm: string): string {
  const [y, mo, d] = dateIso.split('-').map(Number)
  const [h, mi] = hhmm.split(':').map(Number)
  return new Date(y, mo - 1, d, h, mi).toISOString()
}

export function splitDateTime(iso: string): { date: string; time: string } {
  const d = parseDate(iso) ?? new Date()
  return { date: toIsoDate(d), time: format(d, 'HH:mm') }
}

export function relativeDay(iso: string): string {
  const n = daysFromToday(iso)
  if (n === 0) return 'Today'
  if (n === 1) return 'Tomorrow'
  if (n === -1) return 'Yesterday'
  return n > 0 ? `In ${n} days` : `${-n} days ago`
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

import type { FieldValues, Path, UseFormSetError } from 'react-hook-form'
import { ValidationError } from '@/services/errors'

/** Maps service-side validation errors onto form fields. Returns true if anything was mapped. */
export function applyServerErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>): boolean {
  if (!(err instanceof ValidationError)) return false
  const entries = Object.entries(err.fieldErrors)
  for (const [path, message] of entries) setError(path as Path<T>, { type: 'server', message })
  return entries.length > 0
}

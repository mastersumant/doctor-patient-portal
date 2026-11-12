import { useId, type InputHTMLAttributes, type ReactNode, type Ref, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { classNames } from '@/utils/format'

export const controlClass =
  'block w-full rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-muted/70 ' +
  'transition-colors hover:border-muted/60 focus:border-brand-500 focus:outline-none focus:ring-3 focus:ring-brand-100 ' +
  'disabled:bg-sunken disabled:text-muted aria-[invalid=true]:border-danger-600 aria-[invalid=true]:focus:ring-danger-100'

interface FieldProps {
  label: string
  error?: string
  hint?: ReactNode
  required?: boolean
  className?: string
  children: (id: string, describedBy: string | undefined) => ReactNode
}

/** Label + control + hint/error, wired up for screen readers. */
export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId()
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-semibold text-ink-soft">
        {label}
        {required ? <span className="ml-0.5 text-danger-600" aria-hidden>*</span> : null}
      </label>
      {children(id, describedBy)}
      {error ? (
        <p id={`${id}-err`} className="mt-1.5 text-[13px] text-danger-600">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="mt-1.5 text-[13px] text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  )
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { ref?: Ref<HTMLInputElement>; invalid?: boolean; suffix?: string }

export function Input({ className, invalid, suffix, ref, ...rest }: InputProps) {
  if (suffix) {
    return (
      <div className="relative">
        <input ref={ref} aria-invalid={invalid || undefined} className={classNames(controlClass, 'h-10 pr-12', className)} {...rest} />
        <span className="pointer-events-none absolute inset-y-0 right-3 grid place-items-center text-[13px] text-muted">{suffix}</span>
      </div>
    )
  }
  return <input ref={ref} aria-invalid={invalid || undefined} className={classNames(controlClass, 'h-10', className)} {...rest} />
}

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  ref?: Ref<HTMLSelectElement>
  invalid?: boolean
  options: ReadonlyArray<string | { value: string; label: string }>
  placeholder?: string
}

export function Select({ className, invalid, options, placeholder, ref, ...rest }: SelectProps) {
  return (
    <select ref={ref} aria-invalid={invalid || undefined} className={classNames(controlClass, 'h-10 pr-8', className)} {...rest}>
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map((o) => {
        const opt = typeof o === 'string' ? { value: o, label: o } : o
        return (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        )
      })}
    </select>
  )
}

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { ref?: Ref<HTMLTextAreaElement>; invalid?: boolean }

export function Textarea({ className, invalid, rows = 3, ref, ...rest }: TextareaProps) {
  return <textarea ref={ref} rows={rows} aria-invalid={invalid || undefined} className={classNames(controlClass, 'py-2 leading-relaxed', className)} {...rest} />
}

export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="grid gap-5 border-b border-line py-6 first:pt-0 last:border-b-0 lg:grid-cols-[220px_1fr] lg:gap-10">
      <div>
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {description ? <p className="mt-1 text-[13px] leading-relaxed text-muted">{description}</p> : null}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  )
}

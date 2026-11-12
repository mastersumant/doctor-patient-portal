import { Loader2, type LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link } from 'react-router'
import { classNames } from '@/utils/format'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'teal'
type Size = 'sm' | 'md'

const base =
  'inline-flex items-center justify-center gap-2 rounded-[var(--radius-control)] font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-55 select-none'

const variants: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800',
  teal: 'bg-teal-600 text-white hover:bg-teal-700',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-sunken',
  ghost: 'text-ink-soft hover:bg-sunken hover:text-ink',
  danger: 'bg-danger-600 text-white hover:bg-danger-700',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-[13px]',
  md: 'h-10 px-4 text-sm',
}

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  loading?: boolean
  children?: ReactNode
}

export function Button({ variant = 'primary', size = 'md', icon: Icon, loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button type={type} className={classNames(base, variants[variant], sizes[size], className)} disabled={disabled || loading} {...rest}>
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </button>
  )
}

export function ButtonLink({
  to,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  className,
  children,
}: {
  to: string
  variant?: Variant
  size?: Size
  icon?: LucideIcon
  className?: string
  children: ReactNode
}) {
  return (
    <Link to={to} className={classNames(base, variants[variant], sizes[size], className)}>
      {Icon ? <Icon className="size-4" aria-hidden /> : null}
      {children}
    </Link>
  )
}

export function IconButton({
  icon: Icon,
  label,
  className,
  tone = 'default',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; tone?: 'default' | 'danger' }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={classNames(
        'inline-grid size-8 place-items-center rounded-[var(--radius-control)] text-muted transition-colors disabled:opacity-40',
        tone === 'danger' ? 'hover:bg-danger-50 hover:text-danger-600' : 'hover:bg-sunken hover:text-ink',
        className,
      )}
      {...rest}
    >
      <Icon className="size-4" aria-hidden />
    </button>
  )
}

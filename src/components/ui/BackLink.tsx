import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router'

export function BackLink({ to, children }: { to: string; children: string }) {
  return (
    <Link to={to} className="no-print mb-2 inline-flex items-center gap-1 text-[13px] font-semibold text-muted hover:text-ink">
      <ArrowLeft className="size-3.5" aria-hidden /> {children}
    </Link>
  )
}

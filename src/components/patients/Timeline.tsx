import { CalendarClock, CalendarDays, ClipboardList, FileText, Stethoscope, UserPlus, Activity, type LucideIcon } from 'lucide-react'
import { Link } from 'react-router'
import type { TimelineEvent, TimelineKind } from '@/services/analyticsService'
import { formatDate } from '@/utils/dates'
import { classNames } from '@/utils/format'

const KIND: Record<TimelineKind, { icon: LucideIcon; tint: string }> = {
  registered: { icon: UserPlus, tint: 'bg-sunken text-ink-soft' },
  visit: { icon: Stethoscope, tint: 'bg-brand-50 text-brand-700' },
  diagnosis: { icon: Activity, tint: 'bg-warn-50 text-warn-700' },
  prescription: { icon: ClipboardList, tint: 'bg-teal-50 text-teal-700' },
  appointment: { icon: CalendarDays, tint: 'bg-sunken text-ink-soft' },
  followup: { icon: CalendarClock, tint: 'bg-ok-50 text-ok-700' },
  document: { icon: FileText, tint: 'bg-sunken text-ink-soft' },
}

/** The patient's care as one chronological story, newest first. */
export function Timeline({ events, limit }: { events: TimelineEvent[]; limit?: number }) {
  const shown = limit ? events.slice(0, limit) : events
  return (
    <ol className="relative">
      {shown.map((e, i) => {
        const k = KIND[e.kind]
        const content = (
          <>
            <p className="text-[14.5px] font-semibold text-ink group-hover:text-brand-700">{e.title}</p>
            {e.detail ? <p className="mt-0.5 text-[13px] text-muted">{e.detail}</p> : null}
          </>
        )
        return (
          <li key={`${e.kind}-${e.id}`} className="relative flex gap-4 pb-5 last:pb-0">
            {i < shown.length - 1 ? <span className="absolute top-9 bottom-0 left-[17px] w-px bg-line" aria-hidden /> : null}
            <span className={classNames('relative z-[1] grid size-9 shrink-0 place-items-center rounded-full', k.tint)}>
              <k.icon className="size-4" aria-hidden />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="tabular text-[12.5px] text-muted">{formatDate(e.at)}</p>
              {e.link ? (
                <Link to={e.link} className="group block rounded-md">
                  {content}
                </Link>
              ) : (
                content
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

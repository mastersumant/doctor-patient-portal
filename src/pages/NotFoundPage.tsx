import { SearchX } from 'lucide-react'
import { ButtonLink } from '@/components/ui/Button'
import { EmptyState, Panel } from '@/components/ui/Display'

export function NotFoundPage({ what = 'page' }: { what?: string }) {
  return (
    <Panel>
      <EmptyState
        icon={SearchX}
        title={`This ${what} doesn’t exist`}
        description={`It may have been archived, or the link is wrong. Records from other doctors’ workspaces are never shown.`}
        action={<ButtonLink to="/">Go to dashboard</ButtonLink>}
      />
    </Panel>
  )
}

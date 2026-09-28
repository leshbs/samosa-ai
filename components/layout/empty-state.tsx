import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  /**
   * The one action that fills the state (§10: teach the first action).
   *
   * Optional because §5 also says an action a role cannot take is hidden rather
   * than shown disabled — a viewer looking at an empty dataset list should read
   * why it is empty, not be offered an upload button that would 403.
   */
  action?: { label: string; href: string }
  /**
   * `outline` when the page already has its primary action elsewhere — one
   * Ember button per screen (design_system.md §1.2).
   */
  actionVariant?: 'default' | 'outline'
}

/**
 * design_system.md §9.6: a 40px line icon in ink-300, an h3, one sentence that
 * teaches the first step rather than stating absence, and one primary button.
 * The icon is decorative (2.9:1 is fine for something nobody has to read).
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  actionVariant = 'default',
}: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 px-6 py-14 text-center">
        <Icon className="size-10 text-ink-300" strokeWidth={1.5} aria-hidden />
        <p className="text-h3">{title}</p>
        <p className="max-w-sm text-body text-muted-foreground">{description}</p>
        {action ? (
          <Button asChild variant={actionVariant} className="mt-2">
            <Link href={action.href}>{action.label}</Link>
          </Button>
        ) : null}
      </CardContent>
    </Card>
  )
}

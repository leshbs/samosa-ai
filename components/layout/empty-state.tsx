import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export type EmptyStateProps = {
  icon: LucideIcon
  title: string
  description: string
  /** Every empty state names the one action that fills it. */
  action: { label: string; href: string }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <Icon className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="font-medium">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        <Button asChild>
          <Link href={action.href}>{action.label}</Link>
        </Button>
      </CardContent>
    </Card>
  )
}

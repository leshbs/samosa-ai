import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Building blocks for the `loading.tsx` of each route.
 *
 * The checklist asked for a skeleton per async component via TanStack Query's
 * `isPending`. Almost nothing here fetches in the browser — the pages are
 * Server Components that await their data — so the equivalent is a route-level
 * `loading.tsx`, which React streams in while the server work is still running.
 * TanStack Query stays for the two genuinely client-side pollers.
 *
 * The shapes deliberately match the real page: a skeleton that reflows when the
 * content lands is worse than no skeleton at all.
 */

export function PageHeaderSkeleton({ action = false }: { action?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64" />
      </div>
      {action ? <Skeleton className="h-9 w-32" /> : null}
    </div>
  )
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <Card>
      <CardContent className="space-y-3 py-4">
        <Skeleton className="h-4 w-full" />
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </CardContent>
    </Card>
  )
}

export function CardGridSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {Array.from({ length: count }, (_, index) => (
        <Card key={index}>
          <CardContent className="space-y-3 py-6">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="w-full" style={{ height }} />
      </CardContent>
    </Card>
  )
}

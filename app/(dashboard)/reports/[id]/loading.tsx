import {
  CardGridSkeleton,
  ChartSkeleton,
  PageHeaderSkeleton,
} from '@/components/layout/page-skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The slowest page in the app: a job, every one of its results, and the stored
 * summary, all awaited before the first byte. Worth its own shape.
 */
export default function ReportLoading() {
  return (
    <section className="space-y-6">
      <PageHeaderSkeleton action />

      <Card>
        <CardContent className="space-y-3 py-6">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>

      <CardGridSkeleton count={4} />
      <ChartSkeleton />
      <ChartSkeleton />
    </section>
  )
}

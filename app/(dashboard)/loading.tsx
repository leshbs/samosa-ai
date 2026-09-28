import { PageHeaderSkeleton, TableSkeleton } from '@/components/layout/page-skeleton'

/**
 * The default for every dashboard route that does not ship its own. Most of
 * them are a heading over a table, so that is the shape.
 */
export default function DashboardLoading() {
  return (
    <section className="space-y-6">
      <PageHeaderSkeleton action />
      <TableSkeleton />
    </section>
  )
}

import { CardGridSkeleton, PageHeaderSkeleton } from '@/components/layout/page-skeleton'

export default function DashboardHomeLoading() {
  return (
    <section className="space-y-6">
      <PageHeaderSkeleton />
      <CardGridSkeleton count={3} />
    </section>
  )
}

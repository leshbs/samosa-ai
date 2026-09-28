import { PageHeaderSkeleton } from '@/components/layout/page-skeleton'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLoading() {
  return (
    <section className="max-w-2xl space-y-6">
      <PageHeaderSkeleton />
      {Array.from({ length: 3 }, (_, index) => (
        <Card key={index}>
          <CardContent className="space-y-3 py-6">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-4 w-48" />
          </CardContent>
        </Card>
      ))}
    </section>
  )
}

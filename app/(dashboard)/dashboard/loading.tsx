import { Skeleton } from '@/components/ui/skeleton'

/**
 * Same shapes as the page — greeting, banner, five rows — so nothing reflows
 * when the real content streams in. The KPI row is left out on purpose: it only
 * exists for organizations with a report, and a skeleton for something that
 * may not appear is a layout shift in the other direction.
 */
export default function DashboardHomeLoading() {
  return (
    <div className="space-y-12" aria-busy="true" aria-label="Memuat beranda">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="space-y-3">
          <Skeleton className="h-3 w-40" />
          <Skeleton className="h-10 w-72 max-w-full" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-[50px] w-40 rounded-lg" />
      </div>

      <Skeleton className="h-[320px] w-full rounded-2xl" />

      <div className="space-y-5">
        <div className="space-y-2">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-7 w-48" />
        </div>
        <div className="divide-y border-y">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center gap-4 py-4">
              <Skeleton className="size-10 rounded-lg" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-48 max-w-full" />
                <Skeleton className="h-3 w-24" />
              </div>
              <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

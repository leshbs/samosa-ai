import { cn } from '@/lib/utils'

/**
 * sand-100 with a 1.4s shimmer (design_system.md §9.6). A pulse fades the whole
 * block in and out, which on a page of twenty skeletons reads as flicker; the
 * shimmer moves light across a block that stays put.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('skeleton-shimmer rounded-md bg-secondary', className)}
      {...props}
    />
  )
}

export { Skeleton }

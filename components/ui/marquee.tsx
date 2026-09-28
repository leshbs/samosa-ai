import { cn } from '@/lib/utils'

/**
 * Ported from Watermelon UI's `marquee`, which was already the right shape —
 * a pure-CSS transform loop, no JavaScript, no measuring — with four changes:
 *
 * 1. The repeated copies are `aria-hidden`. The original rendered the content
 *    five times into the accessibility tree, so a screen reader read the list
 *    five times.
 * 2. Under `prefers-reduced-motion` the copies disappear and the first one
 *    wraps into a static row, instead of freezing mid-scroll with half an item
 *    cut off at the edge.
 * 3. It pauses on keyboard focus as well as hover.
 * 4. The edges fade with a mask, so items enter rather than being sliced.
 *
 * The vertical mode and the `fast` speed were dropped: nothing here scrolls
 * vertically, and the design system's motion is calm (§6).
 */
const SPEED = {
  slow: '[--duration:70s]',
  normal: '[--duration:40s]',
} as const

export function Marquee({
  children,
  className,
  speed = 'slow',
  repeat = 3,
}: {
  children: React.ReactNode
  className?: string
  speed?: keyof typeof SPEED
  /** Copies laid end to end; enough to overfill the widest screen. */
  repeat?: number
}) {
  return (
    <div
      className={cn(
        'group flex overflow-hidden [--gap:3rem] [gap:var(--gap)]',
        '[mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]',
        'motion-reduce:[mask-image:none]',
        SPEED[speed],
        className,
      )}
    >
      {Array.from({ length: repeat }, (_, index) => (
        <div
          key={index}
          aria-hidden={index > 0 ? true : undefined}
          className={cn(
            'flex shrink-0 animate-marquee items-center justify-around [gap:var(--gap)]',
            'group-focus-within:[animation-play-state:paused] group-hover:[animation-play-state:paused]',
            'motion-reduce:animate-none motion-reduce:flex-wrap motion-reduce:justify-center',
            index > 0 && 'motion-reduce:hidden',
          )}
        >
          {children}
        </div>
      ))}
    </div>
  )
}

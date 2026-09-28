'use client'

import * as React from 'react'
// `motion/react-m` and not `motion/react`: the barrel also exports the
// full-feature `motion` component, and importing anything from it pulled the
// entire animation runtime into every route that used a Reveal (+45 kB measured).
// See ./use-in-view.ts.
import * as m from 'motion/react-m'
import { cn } from '@/lib/utils'
import { EASE } from './motion-provider'
import { useInViewOnce, usePrefersReducedMotion } from './use-in-view'

/**
 * Shared animation vocabulary. Four primitives, used everywhere, so the app
 * animates in one accent instead of each page inventing its own.
 */

const RISE = 8

/**
 * Fades and lifts its child into place the first time it scrolls into view.
 *
 * Once, deliberately: a section that re-animates every time it scrolls past
 * turns a long report into a slideshow. Content is visible from the first
 * server-rendered frame if JavaScript never arrives, because the animation only
 * ever moves opacity and transform, never `display`.
 */
export function Reveal({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>()

  return (
    <m.div
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: RISE }}
      animate={inView ? { opacity: 1, y: 0 } : { opacity: 0, y: RISE }}
      transition={{ duration: 0.32, ease: EASE, delay }}
    >
      {children}
    </m.div>
  )
}

/**
 * Staggers direct `StaggerItem` children. Used for the stat row and the insight
 * cards, where the order of the cards is itself information — the eye lands on
 * the first one first.
 */
export function Stagger({
  children,
  className,
  step = 0.05,
}: {
  children: React.ReactNode
  className?: string
  step?: number
}) {
  const [ref, inView] = useInViewOnce<HTMLDivElement>()

  return (
    <m.div
      ref={ref}
      className={className}
      initial="hidden"
      animate={inView ? 'shown' : 'hidden'}
      variants={{ shown: { transition: { staggerChildren: step } } }}
    >
      {children}
    </m.div>
  )
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <m.div
      className={className}
      variants={{
        hidden: { opacity: 0, y: RISE },
        shown: { opacity: 1, y: 0, transition: { duration: 0.32, ease: EASE } },
      }}
    >
      {children}
    </m.div>
  )
}

/**
 * Counts up to a value.
 *
 * Two rules this has to obey, because the numbers on this page are the point:
 *
 * 1. The final value is exact. The last frame is force-set to `value`, so it can
 *    never settle on a rounding artefact of the interpolation.
 * 2. Assistive technology and `prefers-reduced-motion` never see the
 *    intermediate values at all — they are, briefly, wrong numbers, and a screen
 *    reader announcing "0, 112, 287, 340" is worse than useless. The animated
 *    text is `aria-hidden` and the exact value sits beside it in a visually
 *    hidden span.
 */
export function CountUp({
  value,
  format,
  className,
  duration = 0.6,
}: {
  value: number
  /** Formats both the animated frames and the exact accessible value. */
  format?: (n: number) => string
  className?: string
  duration?: number
}) {
  const reduced = usePrefersReducedMotion()
  const render = React.useMemo(
    () => format ?? ((n: number) => String(Math.round(n))),
    [format],
  )
  const [display, setDisplay] = React.useState(() => render(value))

  React.useEffect(() => {
    if (reduced) {
      setDisplay(render(value))
      return
    }

    let frame = 0
    const start = performance.now()
    const total = duration * 1000

    const tick = (now: number) => {
      const progress = Math.min((now - start) / total, 1)
      // Same shape as every other transition, evaluated as an ease-out cubic.
      const eased = 1 - (1 - progress) ** 3
      setDisplay(render(progress === 1 ? value : value * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }

    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value, render, duration, reduced])

  return (
    <>
      <span className={className} aria-hidden="true">
        {display}
      </span>
      <span className="sr-only">{render(value)}</span>
    </>
  )
}

/**
 * Grows a proportional bar from its left edge. Used by the sentiment strip,
 * which is plain HTML rather than a charting library — so it animates with a
 * transform and costs nothing at runtime.
 */
export function GrowBar({
  share,
  className,
  delay = 0,
  title,
}: {
  share: number
  className?: string
  delay?: number
  title?: string
}) {
  return (
    <m.div
      className={cn('h-full origin-left', className)}
      style={{ width: `${(share * 100).toFixed(2)}%` }}
      title={title}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: 1 }}
      transition={{ duration: 0.48, ease: EASE, delay }}
    />
  )
}

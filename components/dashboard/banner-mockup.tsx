'use client'

import Link from 'next/link'
import { useRef } from 'react'
import { GrowBar } from '@/components/motion/primitives'
import { MOTION_OK, useGsap, type GsapKit } from '@/components/motion/use-gsap'
import { Badge } from '@/components/ui/badge'
import { cn, formatShare } from '@/lib/utils'
import type { Sentiment } from '@/types/domain'

export type MockupReport = {
  /** Null for the sample shown to new accounts: an example is not a link. */
  href: string | null
  name: string
  dateLabel: string
  analyzed: number
  sentiment: Record<Sentiment, number> | null
  excerpt: string | null
}

const SENTIMENT_ROWS: readonly { key: Sentiment; label: string; bar: string }[] = [
  { key: 'positive', label: 'Positif', bar: 'bg-positive' },
  { key: 'neutral', label: 'Netral', bar: 'bg-attention' },
  { key: 'negative', label: 'Negatif', bar: 'bg-negative' },
]

/** Degrees of tilt at the banner's edges. Enough to feel, not to notice. */
const TILT_Y = 5
const TILT_X = 4

/**
 * The report card tilts toward the pointer while it is over the banner.
 *
 * `quickTo` reuses one tween per axis instead of creating a tween per
 * pointermove, which is the difference between a smooth follow and a garbage
 * collector at 120Hz. Only for fine pointers — a tilt that follows a finger
 * would fight the scroll — and only with motion allowed. The card's resting 3°
 * rotation lives in CSS, so GSAP composes onto it and `revert()` hands it back.
 */
function tiltOnPointer({ gsap, root, mm }: GsapKit) {
  mm.add(`${MOTION_OK} and (pointer: fine) and (min-width: 1024px)`, () => {
    const zone = root.closest<HTMLElement>('[data-tilt-zone]') ?? root
    const card = root.querySelector<HTMLElement>('[data-tilt]')
    if (!card) return

    // On the card itself: CSS perspective on an ancestor only reaches direct
    // children, and the card sits inside a link.
    gsap.set(card, { transformPerspective: 900 })

    const toX = gsap.quickTo(card, 'rotationX', { duration: 0.6, ease: 'power3.out' })
    const toY = gsap.quickTo(card, 'rotationY', { duration: 0.6, ease: 'power3.out' })

    const onMove = (event: PointerEvent) => {
      const bounds = zone.getBoundingClientRect()
      const x = (event.clientX - bounds.left) / bounds.width - 0.5
      const y = (event.clientY - bounds.top) / bounds.height - 0.5
      toY(x * TILT_Y * 2)
      toX(-y * TILT_X * 2)
    }
    const onLeave = () => {
      toX(0)
      toY(0)
    }

    zone.addEventListener('pointermove', onMove, { passive: true })
    zone.addEventListener('pointerleave', onLeave)
    return () => {
      zone.removeEventListener('pointermove', onMove)
      zone.removeEventListener('pointerleave', onLeave)
    }
  })
}

/**
 * design_system.md §10.2: a white report card, rotated 3°, shadow-lg, running
 * past the banner's right edge so the banner's `overflow: hidden` clips it.
 *
 * It shows the latest real report when there is one. New accounts get a sample
 * marked "Contoh" — an example that could be mistaken for their data would be
 * the one thing on this page that lies.
 */
export function BannerMockup({ report }: { report: MockupReport }) {
  const scope = useRef<HTMLDivElement>(null)
  useGsap(scope, tiltOnPointer)

  const total = report.sentiment
    ? report.sentiment.positive + report.sentiment.neutral + report.sentiment.negative
    : 0

  const card = (
    <div
      data-tilt
      className={cn(
        'w-[380px] max-w-full rotate-[3deg] rounded-xl border border-ink-200/80 bg-white p-5 text-ink-900 shadow-lg',
        'dark:border-border dark:bg-card dark:text-foreground',
        report.href &&
          'transition-shadow duration-base group-hover:shadow-[0_24px_56px_rgba(26,22,19,.18)]',
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow text-ink-500 dark:text-muted-foreground">Laporan</span>
        {report.href ? null : <Badge variant="example">Contoh</Badge>}
      </div>
      <p className="mt-2 truncate text-h4 font-bold">{report.name}</p>
      <p className="font-mono text-micro text-ink-500 dark:text-muted-foreground">
        {report.dateLabel} · {report.analyzed.toLocaleString('id-ID')} aspirasi
      </p>

      {report.sentiment && total > 0 ? (
        <div className="mt-5 space-y-3">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-secondary">
            {SENTIMENT_ROWS.map(({ key, bar }, index) => (
              <GrowBar
                key={key}
                share={(report.sentiment?.[key] ?? 0) / total}
                className={bar}
                delay={0.35 + index * 0.08}
              />
            ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {SENTIMENT_ROWS.map(({ key, label, bar }) => (
              <li key={key} className="flex items-center gap-1.5 text-[12px]">
                <span className={cn('size-2 rounded-full', bar)} />
                <span className="text-ink-600 dark:text-muted-foreground">{label}</span>
                <span className="font-mono font-medium">
                  {formatShare((report.sentiment?.[key] ?? 0) / total)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report.excerpt ? (
        <p className="mt-4 line-clamp-3 border-t pt-3 text-body-sm text-ink-600 dark:text-muted-foreground">
          {report.excerpt}
        </p>
      ) : null}
    </div>
  )

  return (
    <div
      ref={scope}
      // Offset with padding, not translate: the entrance keyframe ends on
      // `transform: none`, which would override a translate class here.
      className="enter-rise relative hidden justify-end [animation-delay:240ms] sm:flex lg:-mb-16 lg:-mr-20 lg:pt-8"
    >
      {report.href ? (
        <Link
          href={report.href}
          aria-label={`Buka laporan terbaru: ${report.name}`}
          className="group block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-sand-200"
        >
          {card}
        </Link>
      ) : (
        <div aria-hidden>{card}</div>
      )}
    </div>
  )
}

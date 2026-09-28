'use client'

import { LazyMotion, MotionConfig } from 'motion/react'

/** Resolved after hydration, in its own chunk. See ./features.ts. */
const loadFeatures = () => import('./features').then((mod) => mod.default)

/**
 * Wraps the app once so every `m.*` element below it has a renderer and a
 * single, shared motion policy.
 *
 * `reducedMotion="user"` is the important prop: it makes framer-motion read
 * `prefers-reduced-motion` itself and drop transform/opacity animation for
 * anyone who asked, without a single component checking. The CSS in globals.css
 * covers the same ground for plain transitions, so both animation systems obey
 * one setting.
 *
 * `strict` is on so `motion.*` cannot be used by accident: it throws in
 * development if a descendant imports the full-feature component, which is the
 * mistake that would silently undo the bundle split above.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.24, ease: EASE }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  )
}

/**
 * One easing curve for the whole app — design_system.md's `ease-soft`, the same
 * curve the CSS entrance and GSAP (`power3.out` is its near twin) use. It
 * decelerates hard, which reads as "the value settled" rather than "the value
 * is still moving": the right impression for numbers someone is about to quote
 * in a meeting. No springs anywhere (§6): nothing in this UI overshoots.
 */
export const EASE = [0.16, 1, 0.3, 1] as const

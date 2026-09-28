'use client'

import { useEffect, type RefObject } from 'react'
import type { gsap as GsapInstance } from 'gsap'
import type { ScrollTrigger as ScrollTriggerStatic } from 'gsap/ScrollTrigger'

/**
 * GSAP, loaded the way this app loads every animation runtime: after the page
 * is interactive, in its own chunk, and not at all for people who asked for
 * reduced motion.
 *
 * Why a dynamic import instead of `@gsap/react`'s `useGSAP`: that hook imports
 * gsap statically, which puts ~27 kB (gzip) of core plus ~12 kB of ScrollTrigger
 * into the route's first-load JS and in front of hydration. Everything GSAP does
 * here is either scroll-linked or pointer-driven — none of it can start before
 * the user scrolls or moves the mouse — so there is nothing to gain by paying
 * for it up front. The cleanup contract is the one `useGSAP` provides:
 * everything created inside `setup` belongs to a `gsap.matchMedia()` context
 * scoped to the component root, and `revert()` on unmount kills the tweens and
 * ScrollTriggers and removes every inline style they wrote.
 *
 * Division of labour with framer-motion (components/motion/primitives.tsx):
 * framer animates component *state* — a card entering, a number counting, a
 * hover. GSAP animates things whose progress is a function of *scroll position
 * or pointer position*, which is what ScrollTrigger and quickTo are built for
 * and what framer would need a scroll listener per element to imitate.
 */

type Gsap = typeof GsapInstance
export type GsapMatchMedia = ReturnType<Gsap['matchMedia']>

export type GsapKit = {
  gsap: Gsap
  /** Null unless the hook was called with `{ scroll: true }`. */
  ScrollTrigger: typeof ScrollTriggerStatic | null
  root: HTMLElement
  mm: GsapMatchMedia
}

/** Only ever build timelines inside this condition. */
export const MOTION_OK = '(prefers-reduced-motion: no-preference)'

let corePromise: Promise<Gsap> | null = null
let scrollPromise: Promise<typeof ScrollTriggerStatic> | null = null

function loadCore(): Promise<Gsap> {
  corePromise ??= import('gsap').then((mod) => mod.gsap)
  return corePromise
}

function loadScrollTrigger(): Promise<typeof ScrollTriggerStatic> {
  scrollPromise ??= Promise.all([loadCore(), import('gsap/ScrollTrigger')]).then(
    ([gsap, mod]) => {
      gsap.registerPlugin(mod.ScrollTrigger)
      return mod.ScrollTrigger
    },
  )
  return scrollPromise
}

/** Wait for an idle frame so the chunk never competes with hydration. */
function whenIdle(run: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(run, { timeout: 1500 })
    return () => window.cancelIdleCallback(handle)
  }
  const handle = window.setTimeout(run, 200)
  return () => window.clearTimeout(handle)
}

/**
 * Runs `setup` once GSAP has loaded, scoped to `scope`.
 *
 * `setup` must be a stable reference — declare it at module level. It receives
 * a matchMedia context rather than a bare gsap, so every animation it builds
 * sits behind a media query (at least `MOTION_OK`) and is reverted when that
 * query stops matching, not just on unmount.
 */
export function useGsap(
  scope: RefObject<HTMLElement | null>,
  setup: (kit: GsapKit) => void,
  { scroll = false }: { scroll?: boolean } = {},
): void {
  useEffect(() => {
    const root = scope.current
    if (!root) return

    let cancelled = false
    let mm: GsapMatchMedia | undefined

    const cancelIdle = whenIdle(() => {
      Promise.all([loadCore(), scroll ? loadScrollTrigger() : Promise.resolve(null)])
        .then(([gsap, ScrollTrigger]) => {
          if (cancelled) return
          mm = gsap.matchMedia(root)
          setup({ gsap, ScrollTrigger, root, mm })
        })
        .catch((error: unknown) => {
          // Decoration failing to load must never take the page with it; the
          // server-rendered layout is already the complete, static design.
          console.warn('Animation runtime failed to load', error)
        })
    })

    return () => {
      cancelled = true
      cancelIdle()
      mm?.revert()
    }
  }, [scope, setup, scroll])
}

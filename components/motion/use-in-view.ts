'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Two hooks that framer-motion also provides, reimplemented here for one
 * measured reason.
 *
 * `useInView` and `useReducedMotion` live in the `motion/react` barrel alongside
 * the full-feature `motion` component. Importing them from there pulled the
 * complete animation runtime into every route that used a Reveal — measured at
 * +45 kB of first-load JS on six pages, which defeats the whole point of
 * `LazyMotion` and `m`. With these two local, `components/motion/primitives.tsx`
 * imports only `motion/react-m`, which is the element proxies and nothing else.
 *
 * IntersectionObserver is the same API framer-motion uses underneath, and
 * `matchMedia` is the whole of `useReducedMotion`. Neither needed a library.
 */

/** Fires once, when the element first intersects the viewport. */
export function useInViewOnce<T extends Element>(
  margin = '-48px',
): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // Without IntersectionObserver the content should be visible, not animated
    // away. Treating it as already in view is the safe default.
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true)
          observer.disconnect()
        }
      },
      { rootMargin: margin },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [margin])

  return [ref, inView]
}

/**
 * Tracks `prefers-reduced-motion`. Starts false so the server and the first
 * client render agree; the effect corrects it before anything animates, and
 * `MotionConfig reducedMotion="user"` is the backstop for the framer-motion side.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(query.matches)

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  return reduced
}

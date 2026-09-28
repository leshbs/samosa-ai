import { flushSync } from 'react-dom'

/** globals.css turns the default cross-fade off while this class is on <html>. */
const SWITCHING_CLASS = 'theme-switching'

const DURATION_MS = 480

/**
 * Flips the theme as a circle growing out of the control that was clicked.
 *
 * The View Transitions API snapshots the page, runs `apply`, snapshots again,
 * and lets us animate between the two — so every colour on the page changes in
 * one sweep instead of each element fading at its own transition speed.
 * next-themes writes the class in an effect, which `flushSync` forces to run
 * before the second snapshot is taken.
 *
 * Browsers without the API, and anyone who asked for reduced motion, get the
 * instant swap they had before.
 */
export function switchThemeWithTransition(apply: () => void, origin: HTMLElement) {
  if (
    !document.startViewTransition ||
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ) {
    apply()
    return
  }

  const { left, top, width, height } = origin.getBoundingClientRect()
  const x = left + width / 2
  const y = top + height / 2
  // Far enough to cover the corner furthest from the click.
  const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y))

  const root = document.documentElement
  root.classList.add(SWITCHING_CLASS)
  const transition = document.startViewTransition(() => flushSync(apply))

  transition.ready
    .then(() => {
      root.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: DURATION_MS,
          easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
          pseudoElement: '::view-transition-new(root)',
        },
      )
    })
    // A transition skipped by the browser still applied the theme; there is
    // nothing to recover, only the animation to forgo.
    .catch(() => {})
  transition.finished.finally(() => root.classList.remove(SWITCHING_CLASS))
}

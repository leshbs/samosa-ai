'use client'

import { useRef } from 'react'
import { MOTION_OK, useGsap, type GsapKit } from '@/components/motion/use-gsap'

/** Where the step rail lights each node: just after it starts, just before it ends. */
function nodeThreshold(index: number, count: number): number {
  return count <= 1 ? 0.02 : 0.02 + (0.96 * index) / (count - 1)
}

/**
 * Every scroll-linked animation on the landing page, in one place.
 *
 * The rule that keeps this from flashing: a scrubbed animation's progress-0
 * state must equal what the server rendered, because the GSAP chunk arrives a
 * beat after first paint. So the product shot's starting tilt is in CSS
 * (`.shot-tilt`), the hero glow starts where it already is, and everything
 * else that starts from a displaced state is below the fold when GSAP lands.
 *
 * All of it is scrubbed — tied to the scroll position, reversible, and only
 * ever moving when the reader moves — which is how motion stays calm (§6)
 * while the page still feels alive. Transforms and opacity only; no layout
 * property is animated anywhere.
 */
function choreograph({ gsap, ScrollTrigger, root, mm }: GsapKit) {
  if (!ScrollTrigger) return
  const all = (selector: string) => gsap.utils.toArray<HTMLElement>(selector, root)
  const one = (selector: string) => all(selector)[0]

  mm.add({ motion: MOTION_OK, wide: '(min-width: 768px)' }, (context) => {
    const { motion, wide } = context.conditions ?? {}
    if (!motion) return

    // Hero glow lifts and fades as the hero scrolls away.
    const hero = one('[data-gsap="hero"]')
    const glow = one('[data-gsap="glow"]')
    if (hero && glow) {
      gsap.to(glow, {
        yPercent: -25,
        opacity: 0.35,
        ease: 'none',
        scrollTrigger: {
          trigger: hero,
          start: 'top top',
          end: 'bottom top',
          scrub: true,
        },
      })
    }

    // Product shot flattens from its CSS tilt as it approaches the top of the
    // viewport. Starts at scroll 0 so the first frame is the painted frame.
    const shot = one('[data-gsap="shot"]')
    if (shot) {
      gsap.fromTo(
        shot,
        { rotationX: 10, scale: 0.95 },
        {
          rotationX: 0,
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            start: 0,
            end: () =>
              `+=${Math.max(240, shot.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.2)}`,
            scrub: 0.4,
            invalidateOnRefresh: true,
          },
        },
      )
    }

    // The dark honesty panel settles from 96% as it enters.
    const honesty = one('#batasan > div')
    if (honesty) {
      gsap.fromTo(
        honesty,
        { scale: 0.96 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: {
            trigger: honesty,
            start: 'top bottom',
            end: 'top 55%',
            scrub: true,
          },
        },
      )
    }

    if (!wide) return

    // Feature visuals drift against the scroll: the layering cue.
    for (const visual of all('[data-gsap="parallax"]')) {
      gsap.fromTo(
        visual,
        { y: 32 },
        {
          y: -32,
          ease: 'none',
          scrollTrigger: {
            trigger: visual,
            start: 'top bottom',
            end: 'bottom top',
            scrub: true,
          },
        },
      )
    }

    // The steps rail fills; each node and its card light as the fill arrives.
    const steps = one('[data-gsap="steps"]')
    const line = one('[data-gsap="steps-line"]')
    const nodes = all('[data-gsap="step-node"]')
    const cards = all('[data-gsap="step"]')
    if (!steps || !line) return

    const light = (progress: number) => {
      nodes.forEach((node, index) => {
        const on = progress >= nodeThreshold(index, nodes.length)
        node.toggleAttribute('data-active', on)
        cards[index]?.toggleAttribute('data-active', on)
      })
    }

    gsap.fromTo(
      line,
      { scaleX: 0 },
      {
        scaleX: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: steps,
          start: 'top 80%',
          end: 'bottom 65%',
          scrub: 0.5,
          onUpdate: (self) => light(self.progress),
        },
      },
    )

    // Attributes are ours, not GSAP's, so revert() would not remove them.
    return () => [...nodes, ...cards].forEach((el) => el.removeAttribute('data-active'))
  })

  // Web fonts swap in after first layout and move every section a little;
  // measure again once they have.
  void document.fonts?.ready.then(() => ScrollTrigger.refresh())
}

export function LandingMotion({ children }: { children: React.ReactNode }) {
  const scope = useRef<HTMLDivElement>(null)
  useGsap(scope, choreograph, { scroll: true })
  return <div ref={scope}>{children}</div>
}

'use client'

import * as m from 'motion/react-m'
import { EASE } from '@/components/motion/motion-provider'
import { cn } from '@/lib/utils'

/**
 * Watermelon UI's `avatar-group`, rebuilt on this app's motion setup.
 *
 * The original imports the full `motion` component, which throws under this
 * app's `<LazyMotion strict>` (components/motion/motion-provider.tsx) and would
 * otherwise pull the complete animation runtime into the landing page. It also
 * lifts avatars on a spring (stiffness 300, damping 17) — an overshoot, which
 * §6 rules out — and brings @floating-ui for its tooltips. Kept: the overlap,
 * the first-on-top stacking (`invertOverlap`), and the hover lift, now a
 * 160ms ease on `m.li`.
 *
 * The items are icons standing for who the product is for, not photos of
 * customers: there is no customer list to show yet, and faces would imply one.
 */
export type StackItem = {
  label: string
  /** A rendered element, not a component: this crosses the server boundary. */
  icon: React.ReactNode
  tone: string
}

export function AvatarStack({
  items,
  className,
}: {
  items: readonly StackItem[]
  className?: string
}) {
  return (
    <ul className={cn('flex -space-x-2.5', className)} aria-hidden>
      {items.map(({ label, icon, tone }, index) => (
        <m.li
          key={label}
          title={label}
          whileHover={{ y: -4 }}
          transition={{ duration: 0.16, ease: EASE }}
          style={{ zIndex: items.length - index }}
          className={cn(
            'relative flex size-9 items-center justify-center rounded-full ring-2 ring-background [&_svg]:size-4',
            tone,
          )}
        >
          {icon}
        </m.li>
      ))}
    </ul>
  )
}

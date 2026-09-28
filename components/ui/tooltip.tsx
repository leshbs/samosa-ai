'use client'

import * as React from 'react'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'

import { cn } from '@/lib/utils'

/**
 * Ported from Watermelon UI's `tooltip`.
 *
 * One class had to change. The registry version sets
 * `origin-(--radix-tooltip-content-transform-origin)`, which is Tailwind v4's
 * shorthand for a CSS variable. On v3 that is not a recognised utility, so it is
 * dropped silently and the tooltip scales from its centre instead of from the
 * edge it is anchored to — visible as a tooltip that appears to grow out of the
 * wrong place. The v3 spelling is `origin-[var(…)]`.
 *
 * `delayDuration` is 200 rather than the registry's 0: these tooltips explain
 * provenance and confidence, so they should not fire while the pointer is merely
 * crossing the page.
 */
function TooltipProvider({
  delayDuration = 200,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return (
    <TooltipProvider>
      <TooltipPrimitive.Root {...props} />
    </TooltipProvider>
  )
}

const TooltipTrigger = TooltipPrimitive.Trigger

function TooltipContent({
  className,
  sideOffset = 6,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          'z-50 w-fit max-w-xs origin-[var(--radix-tooltip-content-transform-origin)] text-balance rounded-control bg-foreground px-3 py-1.5 text-xs text-background shadow-overlay',
          'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
          'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
          className,
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 -translate-y-[calc(50%_+_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

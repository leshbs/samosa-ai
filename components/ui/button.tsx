import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * design_system.md §9.1. One primary per screen gets the Ember gradient; every
 * other action is neutral. The existing variant names are kept (`default` is
 * the primary, `outline` is the spec's white "secondary") so no page had to be
 * edited to pick up the new look.
 *
 * Text contrast is checked at the gradient's lightest stop, not its average:
 * white on #C24E16 is 4.78:1. The bright variant is the reverse case — white on
 * its lighter stop would be ~2.5:1 — so it carries ink-900 text, and only ever
 * appears on the landing hero.
 *
 * The focus ring is 2px Ember with a 2px offset on every variant and is never
 * removed; `active:` states exist because a button that only responds on hover
 * feels dead on a touchscreen.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap font-semibold',
    'transition-[background-color,color,transform,box-shadow] duration-fast ease-standard',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-45',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ],
  {
    variants: {
      variant: {
        default:
          'bg-grad-primary text-white hover:-translate-y-px hover:bg-grad-primary-hover active:translate-y-0 active:brightness-95',
        bright:
          'bg-grad-primary-bright text-ink-900 hover:-translate-y-px hover:brightness-105 active:translate-y-0 active:brightness-95',
        dark: 'bg-ink-900 text-sand-25 hover:bg-ink-800 active:bg-ink-950 dark:bg-sand-25 dark:text-ink-900 dark:hover:bg-sand-100',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        outline:
          'border border-border bg-card text-foreground hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
        ghostDanger: 'text-danger hover:bg-negative-surface dark:text-destructive',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-[42px] rounded-lg px-[18px] text-sm',
        sm: 'h-[34px] rounded-md px-3 text-[13px]',
        lg: 'h-[50px] rounded-lg px-[26px] text-[15px]',
        icon: 'size-10 rounded-lg',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }

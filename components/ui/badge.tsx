import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

/**
 * Chips (§14) carry topics, evidence references, filters and statuses. They are
 * 6px-radius by token, and they never rely on colour alone — every variant here
 * is legible as text with the fill removed, which is also how they print.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 text-xs font-medium transition-colors [&>svg]:size-3 [&>svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'border-border text-foreground',
        /** Missing/failed data, reported as information rather than alarm (§P2). */
        notice: 'border-transparent bg-notice-surface text-notice',
        /** Counts and provenance values: recedes, still readable. */
        muted: 'border-transparent bg-muted text-muted-foreground',
        /**
         * design_system.md §9.4's eyebrow chip: a section label in a pill.
         * teal-700 on teal-50 is 6.0:1; mono and tracked so it reads as a
         * label, not as content.
         */
        eyebrow:
          'rounded-full border-transparent bg-teal-50 px-2.5 py-1 font-mono text-micro uppercase tracking-[0.12em] text-teal-700 dark:bg-teal-900/60 dark:text-teal-200',
        /** Marks sample content as sample — never let an example pass as data. */
        example:
          'rounded-full border-transparent bg-ember-50 font-mono text-micro uppercase tracking-[0.12em] text-ember-700 dark:bg-ember-900/40 dark:text-ember-200',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
)

/**
 * The interactive form. Kept separate from `badgeVariants` because a filter chip
 * is a button with a pressed state, and folding both into one variant table
 * produced chips that looked clickable but were not.
 */
const filterChipVariants = cva(
  'inline-flex items-center gap-1.5 rounded-chip border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
  {
    variants: {
      active: {
        true: 'border-primary bg-primary text-primary-foreground',
        false:
          'border-border bg-card text-muted-foreground hover:border-input hover:bg-accent hover:text-accent-foreground',
      },
    },
    defaultVariants: { active: false },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants, filterChipVariants }

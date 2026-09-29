'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * A two-state control that says which state it is in. A button with
 * `role="switch"` rather than a styled checkbox: Space and Enter both toggle
 * it, and a screen reader announces "on"/"off" instead of "checked".
 *
 * The same track and knob as the theme switch in the account menu, so the app
 * has one switch, not two that nearly match.
 */
export const Switch = React.forwardRef<
  HTMLButtonElement,
  Omit<React.ComponentProps<'button'>, 'onChange'> & {
    checked: boolean
    onCheckedChange: (checked: boolean) => void
  }
>(({ checked, onCheckedChange, className, disabled, ...props }, ref) => (
  <button
    ref={ref}
    type="button"
    role="switch"
    aria-checked={checked}
    disabled={disabled}
    onClick={() => onCheckedChange(!checked)}
    className={cn(
      'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-fast',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
      'disabled:cursor-not-allowed disabled:opacity-50',
      checked ? 'bg-ember-600' : 'bg-input',
      className,
    )}
    {...props}
  >
    <span
      aria-hidden
      className={cn(
        'absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-xs transition-transform duration-fast ease-standard',
        checked && 'translate-x-4',
      )}
    />
  </button>
))
Switch.displayName = 'Switch'

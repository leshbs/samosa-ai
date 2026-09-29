'use client'

import { cn } from '@/lib/utils'
import {
  INVITABLE_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type InvitableRole,
} from '@/types/domain'

/**
 * Checklist 5.3: each role described by what it lets someone do, never by its
 * internal name. Radio cards rather than a select, because the description is
 * the point and a select can only show the label.
 *
 * Owner is never offered: ownership moves only by transfer.
 */
export function RolePicker({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string
  value: InvitableRole
  onChange: (role: InvitableRole) => void
  disabled?: boolean
}) {
  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <legend className="mb-2 text-sm font-medium">Peran</legend>
      {INVITABLE_ROLES.map((role) => (
        <label
          key={role}
          className={cn(
            'flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors',
            value === role ? 'border-primary bg-primary/5' : 'hover:bg-accent',
          )}
        >
          <input
            type="radio"
            name={name}
            value={role}
            checked={value === role}
            onChange={() => onChange(role)}
            className="mt-1 accent-[hsl(var(--primary))]"
          />
          <span>
            <span className="block text-sm font-medium">{ROLE_LABELS[role]}</span>
            <span className="block text-xs text-muted-foreground">
              {ROLE_DESCRIPTIONS[role]}
            </span>
          </span>
        </label>
      ))}
    </fieldset>
  )
}

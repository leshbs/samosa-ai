'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { requestJson } from '@/modules/shared'

/**
 * One preference, saved the moment it is flipped. A save button for a single
 * switch is a second click that only exists to be forgotten.
 *
 * The switch moves first and moves back if the save fails, with the reason in
 * a toast: waiting on the network before it moves makes it feel broken, and
 * leaving it in the new position after a failure would be a lie.
 */
export function SwitchSetting({
  id,
  label,
  description,
  endpoint,
  field,
  initialChecked,
  savedOn,
  savedOff,
}: {
  id: string
  label: string
  description: string
  endpoint: string
  /** The JSON key the endpoint expects. */
  field: string
  initialChecked: boolean
  savedOn: string
  savedOff: string
}) {
  const [checked, setChecked] = useState(initialChecked)
  const [saving, setSaving] = useState(false)

  async function change(next: boolean) {
    setChecked(next)
    setSaving(true)
    const saved = await requestJson(endpoint, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ [field]: next }),
    })
    setSaving(false)

    if (!saved.ok) {
      setChecked(!next)
      toast.error(saved.error.message)
      return
    }
    toast.success(next ? savedOn : savedOff)
  }

  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="space-y-1">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        <p id={`${id}-description`} className="text-sm text-muted-foreground">
          {description}
        </p>
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={change}
        disabled={saving}
        aria-describedby={`${id}-description`}
        className="mt-0.5"
      />
    </div>
  )
}

/** The same row for someone who may read the setting but not change it. */
export function SettingValue({
  label,
  description,
  value,
}: {
  label: string
  description: string
  value: string
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-4">
      <div className="space-y-1">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <span className="shrink-0 text-sm font-medium">{value}</span>
    </div>
  )
}

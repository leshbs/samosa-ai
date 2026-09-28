'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export type EditableNameFormProps = {
  id: string
  label: string
  endpoint: string
  /** The JSON key the endpoint expects, e.g. "displayName" or "name". */
  field: string
  initialValue: string
  placeholder?: string
  successMessage: string
  description?: string
  disabled?: boolean
  disabledReason?: string
}

/**
 * One field, one save button. Both settings the page can change are a single
 * string behind a PATCH, so they share a form rather than each growing their
 * own copy of the same fetch-and-toast.
 */
export function EditableNameForm({
  id,
  label,
  endpoint,
  field,
  initialValue,
  placeholder,
  successMessage,
  description,
  disabled = false,
  disabledReason,
}: EditableNameFormProps) {
  const router = useRouter()
  const [value, setValue] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  const trimmed = value.trim()
  // Nothing to save when it is blank or unchanged; the button says so.
  const unchanged = trimmed === initialValue.trim() || trimmed.length === 0

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (unchanged || disabled) return

    setSaving(true)
    try {
      const response = await fetch(endpoint, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: trimmed }),
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        toast.error(body?.error?.message ?? 'Gagal menyimpan. Coba lagi.')
        return
      }

      toast.success(successMessage)
      // The header and every server component read this from the session.
      router.refresh()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="flex flex-wrap gap-2">
        <Input
          id={id}
          value={value}
          placeholder={placeholder}
          disabled={disabled || saving}
          onChange={(event) => setValue(event.target.value)}
          className="min-w-48 flex-1"
        />
        <Button type="submit" size="sm" disabled={disabled || saving || unchanged}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </Button>
      </div>
      {(disabled ? disabledReason : description) && (
        <p className="text-xs text-muted-foreground">
          {disabled ? disabledReason : description}
        </p>
      )}
    </form>
  )
}

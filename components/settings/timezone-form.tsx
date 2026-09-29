'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { requestJson } from '@/modules/shared'
import { ORG_TIME_ZONES, type OrgTimeZone } from '@/types/domain'

export const TIME_ZONE_LABELS: Record<OrgTimeZone, string> = {
  'Asia/Jakarta': 'WIB — Waktu Indonesia Barat (UTC+7)',
  'Asia/Makassar': 'WITA — Waktu Indonesia Tengah (UTC+8)',
  'Asia/Jayapura': 'WIT — Waktu Indonesia Timur (UTC+9)',
}

/** A native select: three options, and the phone's own picker is the best one. */
export function TimezoneForm({ initialValue }: { initialValue: OrgTimeZone }) {
  const router = useRouter()
  const [value, setValue] = useState(initialValue)
  const [saved, setSaved] = useState(initialValue)
  const [saving, setSaving] = useState(false)

  async function save(event: React.FormEvent) {
    event.preventDefault()
    setSaving(true)
    const result = await requestJson('/api/settings/organization', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ timezone: value }),
    })
    setSaving(false)

    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setSaved(value)
    toast.success('Zona waktu tersimpan.')
    // Every date on every page is formatted on the server in this zone.
    router.refresh()
  }

  return (
    <form onSubmit={save} className="space-y-2">
      <Label htmlFor="timezone">Zona waktu</Label>
      <div className="flex flex-wrap gap-2">
        <select
          id="timezone"
          value={value}
          onChange={(event) => setValue(event.target.value as OrgTimeZone)}
          disabled={saving}
          className="h-9 min-w-48 flex-1 rounded-md border border-input bg-card px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {ORG_TIME_ZONES.map((zone) => (
            <option key={zone} value={zone}>
              {TIME_ZONE_LABELS[zone]}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" disabled={saving || value === saved}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Dipakai untuk setiap tanggal di aplikasi, di laporan PDF, dan di email.
      </p>
    </form>
  )
}

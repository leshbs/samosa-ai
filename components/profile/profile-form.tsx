'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestJson } from '@/modules/shared'

/**
 * Name and position together, because they are read together: "Rani Putri ·
 * Sekretaris OSIS 2026/2027" on every report she prepares. The position is
 * free text on purpose — school committees do not share a job-title list —
 * and may be left blank.
 */
export function ProfileForm({
  initialName,
  initialTitle,
}: {
  initialName: string
  initialTitle: string
}) {
  const router = useRouter()
  const [name, setName] = useState(initialName)
  const [title, setTitle] = useState(initialTitle)
  const [saved, setSaved] = useState({ name: initialName, title: initialTitle })
  const [saving, setSaving] = useState(false)

  const unchanged =
    name.trim() === saved.name.trim() && title.trim() === saved.title.trim()

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (unchanged || name.trim() === '') return

    setSaving(true)
    const result = await requestJson('/api/settings/profile', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: name.trim(), title: title.trim() }),
    })
    setSaving(false)

    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setSaved({ name: name.trim(), title: title.trim() })
    toast.success('Profil tersimpan.')
    router.refresh()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="display-name">Nama</Label>
        <Input
          id="display-name"
          value={name}
          maxLength={80}
          required
          autoComplete="name"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="title">Jabatan di organisasi</Label>
        <Input
          id="title"
          value={title}
          maxLength={80}
          placeholder="Sekretaris OSIS 2026/2027"
          onChange={(event) => setTitle(event.target.value)}
          aria-describedby="title-description"
        />
        <p id="title-description" className="text-xs text-muted-foreground">
          Muncul di bawah namamu di laporan PDF yang kamu unduh, dan di keterangan asal
          data untuk analisis yang kamu jalankan.
        </p>
      </div>
      <Button
        type="submit"
        size="sm"
        disabled={saving || unchanged || name.trim() === ''}
      >
        {saving ? 'Menyimpan…' : 'Simpan profil'}
      </Button>
    </form>
  )
}

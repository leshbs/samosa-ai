'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestJson } from '@/modules/shared'

/**
 * Starts a workspace the signed-in person will own: on the welcome page for
 * someone who has none, and on the profile for a member of somebody else's
 * organization who wants their own. The server decides whether their plan has
 * room for it and switches them into it.
 */
export function CreateWorkspaceForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await requestJson('/api/workspace', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name }),
    })

    if (!result.ok) {
      setPending(false)
      setError(result.error.message)
      return
    }
    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={create} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="workspace-name">Nama ruang kerja baru</Label>
        <Input
          id="workspace-name"
          value={name}
          maxLength={120}
          placeholder="OSIS SMA Nusantara"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <Button
        type="submit"
        className="w-full"
        disabled={pending || name.trim().length < 2}
      >
        {pending ? 'Membuat…' : 'Buat ruang kerja'}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}

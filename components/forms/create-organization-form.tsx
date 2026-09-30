'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestJson } from '@/modules/shared'

/**
 * Starts a fresh organization for a signed-in account that has none. It goes
 * through the same provisioning endpoint as sign-up, which only ever creates
 * one for the caller and is a no-op if a membership appeared meanwhile.
 */
export function CreateOrganizationForm() {
  const router = useRouter()
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function create(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    setError(null)
    const result = await requestJson('/api/auth/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationName: name }),
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
        <Label htmlFor="organization-name">Nama organisasi baru</Label>
        <Input
          id="organization-name"
          value={name}
          maxLength={120}
          placeholder="OSIS SMA Nusantara"
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={pending || name.trim() === ''}>
        {pending ? 'Membuat…' : 'Buat organisasi'}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}

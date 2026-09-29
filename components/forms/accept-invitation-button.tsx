'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { requestJson } from '@/modules/shared'

/**
 * The one action on the invite page for someone signed in. A failure stays on
 * the page with the server's sentence — wrong email, expired, already in
 * another organization — because each of those has a different fix and the
 * message names it.
 */
export function AcceptInvitationButton({
  token,
  organizationName,
}: {
  token: string
  organizationName: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function accept() {
    setPending(true)
    setError(null)
    const result = await requestJson('/api/invitations/accept', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
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
    <div className="space-y-3">
      <Button type="button" className="w-full" onClick={accept} disabled={pending}>
        {pending ? 'Bergabung…' : `Gabung ke ${organizationName}`}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

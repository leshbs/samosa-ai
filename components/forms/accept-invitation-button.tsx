'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { requestJson } from '@/modules/shared'

/**
 * The one action on the invite page for someone signed in. A failure stays on
 * the page with the server's sentence — wrong email, expired, revoked —
 * because each of those has a different fix and the message names it.
 *
 * Joining never removes anything of the person's own. The one thing it can
 * cost is the organization they follow now (`leaving`), and that is asked
 * first, by name.
 */
export function AcceptInvitationButton({
  token,
  organizationName,
  leaving,
}: {
  token: string
  organizationName: string
  /** Name of the organization the person gives up by accepting, if any. */
  leaving?: string
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
      body: JSON.stringify(leaving ? { token, leave: true } : { token }),
    })

    if (!result.ok) {
      setPending(false)
      setError(result.error.message)
      return
    }
    router.replace('/dashboard')
    router.refresh()
  }

  const label = pending ? 'Bergabung…' : `Gabung ke ${organizationName}`

  return (
    <div className="space-y-3">
      {leaving ? (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button type="button" className="w-full" disabled={pending}>
              {label}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Keluar dari {leaving}?</AlertDialogTitle>
              <AlertDialogDescription>
                Untuk sekarang kamu hanya bisa mengikuti satu organisasi. Bergabung ke{' '}
                {organizationName} berarti keluar dari {leaving}. Data di sana tidak
                terhapus dan ruang kerjamu sendiri tidak tersentuh, tapi untuk masuk lagi
                ke {leaving} kamu perlu undangan baru.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Batal</AlertDialogCancel>
              <AlertDialogAction onClick={accept}>Keluar dan bergabung</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : (
        <Button type="button" className="w-full" onClick={accept} disabled={pending}>
          {label}
        </Button>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

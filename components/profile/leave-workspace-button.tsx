'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
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
 * Leaving an organization you were invited to. Only rendered for workspaces
 * the person does not own (no dead controls); the server refuses an owner
 * regardless.
 */
export function LeaveWorkspaceButton({
  organizationId,
  name,
}: {
  organizationId: string
  name: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function leave() {
    setPending(true)
    const result = await requestJson('/api/workspace/leave', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationId }),
    })

    if (!result.ok) {
      setPending(false)
      toast.error(result.error.message)
      return
    }
    toast.success(`Kamu keluar dari ${name}.`)
    // The dashboard works out where they are now: their other workspace, or
    // the welcome page when this was the only one.
    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" disabled={pending}>
          {pending ? 'Keluar…' : 'Keluar'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Keluar dari {name}?</AlertDialogTitle>
          <AlertDialogDescription>
            Kamu tidak akan bisa lagi membuka dataset dan laporan {name}. Semua yang kamu
            unggah dan analisis yang kamu jalankan tetap di sana, dengan namamu. Untuk
            masuk lagi kamu perlu undangan baru.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={leave}>Keluar</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

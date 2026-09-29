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
import { createClient } from '@/lib/supabase/client'

/**
 * Checklist 5.8. School lab computers are shared, and a session left signed in
 * on one is routine rather than an edge case — this ends every session the
 * account has, including the one on the machine it is pressed from.
 */
export function SignOutEverywhere() {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOutEverywhere() {
    setPending(true)
    const { error } = await createClient().auth.signOut({ scope: 'global' })
    if (error) {
      setPending(false)
      toast.error('Gagal mengeluarkan sesi. Periksa koneksimu lalu coba lagi.')
      return
    }
    router.replace('/login')
    router.refresh()
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="outline" disabled={pending}>
          Keluar dari semua perangkat
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Keluar dari semua perangkat?</AlertDialogTitle>
          <AlertDialogDescription>
            Semua sesi akunmu berakhir — termasuk di perangkat ini dan di komputer lab
            yang mungkin lupa kamu keluarkan. Kamu perlu masuk lagi di mana pun. Data
            tidak terhapus.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={signOutEverywhere}>
            Keluar dari semua
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

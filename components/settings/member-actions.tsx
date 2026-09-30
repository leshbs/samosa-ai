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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { requestJson } from '@/modules/shared'
import type { InvitableRole } from '@/types/domain'
import { RolePicker } from './role-picker'

/**
 * Change role and remove, for one member. Only rendered for rows the viewer
 * may change — never the owner's, never their own (§5: no dead controls).
 */
export function MemberActions({
  userId,
  name,
  role,
}: {
  userId: string
  name: string
  role: InvitableRole
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [next, setNext] = useState<InvitableRole>(role)
  const [pending, setPending] = useState(false)

  async function changeRole() {
    setPending(true)
    const result = await requestJson(`/api/settings/members/${userId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ role: next }),
    })
    setPending(false)

    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    toast.success(`Peran ${name} diubah.`)
    setOpen(false)
    router.refresh()
  }

  async function remove() {
    setPending(true)
    const result = await requestJson(`/api/settings/members/${userId}`, {
      method: 'DELETE',
    })
    setPending(false)

    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    toast.success(`${name} dikeluarkan dari organisasi.`)
    router.refresh()
  }

  return (
    <div className="flex shrink-0 gap-1">
      <Dialog
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (value) setNext(role)
        }}
      >
        <DialogTrigger asChild>
          <Button type="button" variant="ghost" size="sm">
            Ubah peran
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ubah peran {name}</DialogTitle>
            <DialogDescription>
              Berlaku saat itu juga, di semua perangkatnya.
            </DialogDescription>
          </DialogHeader>
          <RolePicker
            name={`role-${userId}`}
            value={next}
            onChange={setNext}
            disabled={pending}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Batal
            </Button>
            <Button
              type="button"
              disabled={pending || next === role}
              onClick={changeRole}
            >
              {pending ? 'Menyimpan…' : 'Simpan peran'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="ghostDanger" size="sm">
            Keluarkan
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keluarkan {name}?</AlertDialogTitle>
            <AlertDialogDescription>
              {name} langsung kehilangan akses ke semua dataset dan laporan organisasi
              ini. Akunnya tetap ada, dan data yang pernah diunggahnya tetap di sini.
              Untuk mengembalikannya, undang lagi.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={pending}>
              Keluarkan
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/** Cancels a pending invitation; its link stops working immediately. */
export function RevokeInvitationButton({ id, email }: { id: string; email: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function revoke() {
    setPending(true)
    const result = await requestJson(`/api/settings/invitations/${id}`, {
      method: 'DELETE',
    })
    setPending(false)

    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    toast.success(`Undangan untuk ${email} dibatalkan.`)
    router.refresh()
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      onClick={revoke}
      aria-label={`Batalkan undangan untuk ${email}`}
    >
      {pending ? 'Membatalkan…' : 'Batalkan'}
    </Button>
  )
}

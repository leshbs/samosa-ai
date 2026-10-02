'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import { requestJson } from '@/modules/shared'

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
}

/**
 * Checklist 5.7, with §P7's rule that a destructive confirmation says exactly
 * what goes. The counts are passed in from the page so the sentence is about
 * this organization, not a generic warning people have learned to click past.
 *
 * Afterwards the account has no organization, so it is signed out rather than
 * left on a dashboard that can no longer load.
 */
export function DeleteOrganizationDialog({
  organizationName,
  solo = false,
  datasets,
  reports,
  members,
}: {
  organizationName: string
  /** One person, nobody invited: the wording drops "organisasi". */
  solo?: boolean
  datasets: number | null
  reports: number | null
  members: number | null
}) {
  const router = useRouter()
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)
  const confirmed =
    normalize(typed) !== '' && normalize(typed) === normalize(organizationName)

  const parts = [
    datasets !== null
      ? `${datasets} dataset beserta seluruh aspirasinya`
      : 'semua dataset',
    reports !== null ? `${reports} laporan` : 'semua laporan',
    members !== null && members > 1
      ? `akses ${members - 1} anggota lain`
      : 'semua undangan yang belum dipakai',
  ]

  async function remove() {
    setPending(true)
    const result = await requestJson('/api/settings/organization', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ confirmation: typed }),
    })

    if (!result.ok) {
      setPending(false)
      toast.error(result.error.message)
      return
    }

    await createClient().auth.signOut()
    toast.success(`${organizationName} sudah dihapus.`)
    router.replace('/')
    router.refresh()
  }

  return (
    <AlertDialog onOpenChange={(open) => !open && setTyped('')}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          {solo ? 'Hapus semua data' : 'Hapus organisasi'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Hapus {organizationName} selamanya?</AlertDialogTitle>
          <AlertDialogDescription>
            Yang terhapus: {parts.join(', ')}, logo, dan file unggahan aslinya. Tidak ada
            salinan yang disimpan SAMOSA, dan tindakan ini tidak bisa dibatalkan. Unduh
            arsipnya dulu kalau masih perlu.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-confirmation">
            Ketik <span className="font-semibold">{organizationName}</span> untuk
            konfirmasi
          </Label>
          <Input
            id="delete-confirmation"
            value={typed}
            autoComplete="off"
            onChange={(event) => setTyped(event.target.value)}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Batal</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            disabled={!confirmed || pending}
            onClick={remove}
          >
            {pending ? 'Menghapus…' : solo ? 'Hapus semua data' : 'Hapus organisasi'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

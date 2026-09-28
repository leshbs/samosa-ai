'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
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

/**
 * Behind a confirmation because every press is a paid model call that
 * overwrites the narrative someone may already have quoted elsewhere.
 */
export function RegenerateSummaryButton({
  jobId,
  hasSummary,
}: {
  jobId: string
  hasSummary: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  async function regenerate() {
    setOpen(false)
    const response = await fetch(`/api/reports/${jobId}/summary`, { method: 'POST' })

    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as {
        error?: { message?: string }
      } | null
      toast.error(body?.error?.message ?? 'Ringkasan gagal dibuat. Coba lagi.')
      return
    }

    toast.success('Ringkasan diperbarui.')
    startTransition(() => router.refresh())
  }

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="sm" disabled={pending}>
          {hasSummary ? 'Buat ulang ringkasan' : 'Buat ringkasan'}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {hasSummary ? 'Buat ulang ringkasan?' : 'Buat ringkasan?'}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {hasSummary
              ? 'Ringkasan dan insight yang sekarang akan ditimpa, dan ini memanggil model AI sekali lagi sehingga ada biayanya. Angka dan grafik tidak berubah.'
              : 'Ini memanggil model AI sekali untuk menyusun ringkasan dari hasil analisis yang sudah ada. Angka dan grafik tidak berubah.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={regenerate}>Lanjutkan</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

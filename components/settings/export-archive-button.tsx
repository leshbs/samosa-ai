'use client'

import { Download } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

const FALLBACK_NAME = 'samosa-arsip.zip'

function fileNameFrom(disposition: string | null): string {
  const match = disposition?.match(/filename="([^"]+)"/)
  return match?.[1] ?? FALLBACK_NAME
}

/**
 * Fetches the archive rather than linking to it. A plain link would save a
 * rate-limit or permission error as "samosa-arsip.zip" containing JSON; this
 * way an error is a toast with the reason, and the button says it is working
 * for the half-minute a large organization takes.
 */
export function ExportArchiveButton() {
  const [pending, setPending] = useState(false)

  async function download() {
    setPending(true)
    try {
      const response = await fetch('/api/settings/organization/export')
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string }
        } | null
        toast.error(body?.error?.message ?? 'Arsip gagal dibuat. Coba lagi.')
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = fileNameFrom(response.headers.get('content-disposition'))
      document.body.append(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      toast.success('Arsip diunduh.')
    } catch {
      toast.error('Koneksi terputus saat mengunduh arsip. Coba lagi.')
    } finally {
      setPending(false)
    }
  }

  return (
    <Button type="button" variant="outline" onClick={download} disabled={pending}>
      <Download aria-hidden />
      {pending ? 'Menyiapkan arsip…' : 'Unduh semua data (.zip)'}
    </Button>
  )
}

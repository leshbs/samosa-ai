'use client'

import { Sparkles } from 'lucide-react'
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

export function AnalyzeButton({
  datasetId,
  responseCount,
  estimatedCost,
  estimatedSeconds,
}: {
  datasetId: string
  responseCount: number
  /** Pre-formatted on the server — pricing tables are not client concerns. */
  estimatedCost: string
  estimatedSeconds: number
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function start() {
    setPending(true)

    const response = await fetch('/api/analysis', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ datasetId }),
    })

    const payload = (await response.json()) as
      { data: { jobId: string } } | { error: { message: string } }

    setPending(false)

    if (!response.ok || !('data' in payload)) {
      toast.error('error' in payload ? payload.error.message : 'Analisis gagal dimulai.')
      return
    }

    router.push(`/analysis/${payload.data.jobId}`)
  }

  const minutes = Math.ceil(estimatedSeconds / 60)

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button disabled={pending || responseCount === 0}>
          <Sparkles className="mr-2 h-4 w-4" aria-hidden />
          Analisis
        </Button>
      </AlertDialogTrigger>

      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Jalankan analisis?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              <p>
                {responseCount} aspirasi akan dikirim ke model untuk diberi sentimen,
                topik, dan kata kunci.
              </p>
              <dl className="space-y-1">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Perkiraan biaya</dt>
                  <dd className="font-medium">{estimatedCost}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Perkiraan waktu</dt>
                  <dd className="font-medium">
                    {estimatedSeconds < 60
                      ? `± ${estimatedSeconds} detik`
                      : `± ${minutes} menit`}
                  </dd>
                </div>
              </dl>
              <p className="text-muted-foreground">
                Perkiraan, bukan angka pasti. Biaya sebenarnya dicatat setelah job
                selesai.
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Batal</AlertDialogCancel>
          <AlertDialogAction onClick={start} disabled={pending}>
            {pending ? 'Memulai…' : 'Jalankan'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

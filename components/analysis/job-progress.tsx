'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { Progress } from '@/components/ui/progress'
import type { JobStatus } from '@/types/domain'

const POLL_INTERVAL_MS = 2_000

/** Once a job reaches one of these there is nothing left to poll for. */
const TERMINAL: readonly JobStatus[] = ['succeeded', 'partial', 'failed', 'cancelled']

type JobStatusPayload = {
  jobId: string
  status: JobStatus
  processedCount: number
  totalCount: number
  errorMessage: string | null
  finishedAt: string | null
}

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'Menunggu giliran…',
  running: 'Menganalisis…',
  succeeded: 'Selesai',
  partial: 'Selesai sebagian',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
}

export function JobProgress({
  jobId,
  initialStatus,
  initialProcessed,
  initialTotal,
}: {
  jobId: string
  initialStatus: JobStatus
  initialProcessed: number
  initialTotal: number
}) {
  const router = useRouter()

  const { data } = useQuery({
    queryKey: ['analysis-job', jobId],
    queryFn: async (): Promise<JobStatusPayload> => {
      const response = await fetch(`/api/analysis/${jobId}/status`)
      if (!response.ok) throw new Error('status unavailable')
      const payload = (await response.json()) as { data: JobStatusPayload }
      return payload.data
    },
    initialData: {
      jobId,
      status: initialStatus,
      processedCount: initialProcessed,
      totalCount: initialTotal,
      errorMessage: null,
      finishedAt: null,
    },
    // Stop hitting the endpoint the moment the job is done.
    refetchInterval: (query) =>
      query.state.data && TERMINAL.includes(query.state.data.status)
        ? false
        : POLL_INTERVAL_MS,
    staleTime: 0,
  })

  const finished = TERMINAL.includes(data.status)

  useEffect(() => {
    // The results live in a Server Component, so a refresh is what reveals them.
    if (finished) router.refresh()
  }, [finished, router])

  const percent =
    data.totalCount > 0
      ? Math.min(100, Math.round((data.processedCount / data.totalCount) * 100))
      : 0

  if (finished && data.status !== 'failed') return null

  return (
    <div className="space-y-2 rounded-lg border p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">{STATUS_LABELS[data.status]}</span>
        <span className="tabular-nums text-muted-foreground">
          {data.processedCount} / {data.totalCount || '?'}
        </span>
      </div>

      <Progress value={percent} aria-label="Progres analisis" />

      {data.status === 'failed' ? (
        <p role="alert" className="text-sm text-destructive">
          {data.errorMessage ?? 'Analisis gagal.'}
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          Halaman ini memperbarui sendiri setiap dua detik. Aman untuk ditutup — job tetap
          berjalan.
        </p>
      )}
    </div>
  )
}

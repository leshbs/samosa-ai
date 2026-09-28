'use client'

import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { useEffect } from 'react'
import { InlineError } from '@/components/layout/inline-error'
import { Progress } from '@/components/ui/progress'
import { StatusIndicator } from '@/components/ui/status-indicator'
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

const STATUS_MESSAGES: Record<JobStatus, string> = {
  queued: 'Menunggu giliran. Job sudah masuk antrean dan akan mulai sendiri.',
  running: 'Menganalisis batch demi batch. Aman untuk menutup halaman ini.',
  succeeded: 'Seluruh aspirasi berhasil dianalisis.',
  partial: 'Sebagian batch gagal. Hasil yang berhasil tetap disimpan.',
  failed: 'Analisis berhenti sebelum selesai.',
  cancelled: 'Analisis dibatalkan.',
}

/**
 * §P5: never wait silently. The panel shows a percentage, a processed count, a
 * failed count, the model, a cost figure and a status sentence — never a bare
 * spinner.
 *
 * Two of those cannot come from the polling endpoint. `GET
 * /api/analysis/[id]/status` returns six fields and neither the model nor the
 * failed count is among them, and §15 rules out changing API contracts. They are
 * passed in from the server component instead, which already has the job row —
 * so the model and the cost estimate are correct from the first frame, and the
 * failed count is the value as of page load. It becomes live on the refresh that
 * fires when the job reaches a terminal status, which is also the only moment the
 * orchestrator knows it: batch failures are counted when the run finishes, not
 * as it goes.
 */
export function JobProgress({
  jobId,
  initialStatus,
  initialProcessed,
  initialTotal,
  modelId,
  failedCount,
  cost,
}: {
  jobId: string
  initialStatus: JobStatus
  initialProcessed: number
  initialTotal: number
  /** From the job row; the status endpoint does not carry it. */
  modelId: string
  failedCount: number
  /** Actual cost once known, otherwise the pre-run estimate. Pre-formatted. */
  cost: { label: string; value: string }
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

  if (data.status === 'failed') {
    return (
      <InlineError
        what={data.errorMessage ?? 'Analisis gagal di tengah jalan.'}
        why={`Berhenti setelah ${data.processedCount} dari ${data.totalCount || '?'} aspirasi.`}
        recovery="Jalankan analisis lagi dari halaman dataset. Percobaan ini tetap tersimpan sebagai riwayat."
      />
    )
  }

  return (
    <section
      aria-label="Progres analisis"
      className="space-y-3 rounded-card border bg-card p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <StatusIndicator status={data.status} />
        <span className="text-sm tabular-nums text-muted-foreground">
          <span className="font-semibold text-foreground">{percent}%</span> ·{' '}
          {data.processedCount} / {data.totalCount || '?'} aspirasi
        </span>
      </div>

      <Progress value={percent} aria-label={`Progres analisis ${percent} persen`} />

      <dl className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-muted-foreground">Model</dt>
          <dd className="font-medium">{modelId || 'belum tercatat'}</dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-muted-foreground">Gagal</dt>
          <dd className="font-medium">
            {failedCount > 0 ? (
              <span className="text-notice">{failedCount} aspirasi</span>
            ) : (
              'belum ada'
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-2 sm:block">
          <dt className="text-muted-foreground">{cost.label}</dt>
          <dd className="font-medium">{cost.value}</dd>
        </div>
      </dl>

      <p className="text-xs text-muted-foreground">
        {STATUS_MESSAGES[data.status]} Halaman ini memperbarui sendiri setiap dua detik.
      </p>
    </section>
  )
}

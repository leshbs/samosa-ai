'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { JobStatus } from '@/types/domain'

const TERMINAL: readonly JobStatus[] = ['succeeded', 'partial', 'failed', 'cancelled']

/**
 * Refreshes the report when its job finishes somewhere else — a re-run started
 * in another tab, or by a committee member on their own laptop. Realtime
 * rather than polling: the report is a page people leave open on a projector
 * for an hour, and a two-second poll for an event that happens once is a lot
 * of requests to notice nothing.
 */
export function ReportRealtime({
  jobId,
  organizationId,
  currentStatus,
}: {
  jobId: string
  organizationId: string
  currentStatus: JobStatus
}) {
  const router = useRouter()
  // A refresh re-renders this component with fresh props; without this guard
  // the same completion would toast again on every subsequent event.
  const announced = useRef(TERMINAL.includes(currentStatus))

  useEffect(() => {
    const supabase = createClient()
    let channel: RealtimeChannel | null = null
    let cancelled = false

    async function listen() {
      // Hand the session to the socket *before* subscribing. Realtime runs
      // every change through the subscriber's own RLS policies, and a socket
      // that opened with nothing but the anon key is not a member of any
      // organization -- so it joins happily, reports "Subscribed to
      // PostgreSQL", and then receives silence forever. Measured, not
      // guessed: an anon socket and a signed-in one both report SUBSCRIBED,
      // and only the signed-in one is delivered a single row.
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token || cancelled) return
      await supabase.realtime.setAuth(token)
      if (cancelled) return

      channel = supabase
        .channel(`report-${jobId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'analysis_jobs',
            // Scoped to this tenant so an unrelated job elsewhere cannot make
            // this page flash; RLS is the boundary, this is the noise filter.
            filter: `organization_id=eq.${organizationId}`,
          },
          (payload) => {
            const next = payload.new as { id?: string; status?: JobStatus }
            if (next.id !== jobId || !next.status) return
            if (!TERMINAL.includes(next.status)) return
            if (announced.current) return

            announced.current = true
            toast.success('Analisis selesai — laporan diperbarui.')
            router.refresh()
          },
        )
        .subscribe()
    }

    void listen()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [jobId, organizationId, router])

  return null
}

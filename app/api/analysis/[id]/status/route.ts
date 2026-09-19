import { getSessionUser } from '@/modules/auth'
import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError } from '@/modules/shared'
import { failure, success } from '@/app/api/_lib/respond'

type RouteContext = { params: Promise<{ id: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const { id } = await context.params
  const supabase = await createClient()

  // RLS scopes this to the caller's organization; no extra filter needed.
  const { data, error } = await supabase
    .from('analysis_jobs')
    .select('id, status, processed_count, total_count, error_message, finished_at')
    .eq('id', id)
    .maybeSingle()

  if (error) return failure(appError(ERROR_CODES.INTERNAL, 'Could not load job status'))
  if (!data) return failure(appError(ERROR_CODES.NOT_FOUND, 'Analysis job not found'))

  return success({
    jobId: String(data.id),
    status: data.status,
    processedCount: Number(data.processed_count),
    totalCount: Number(data.total_count),
    errorMessage: data.error_message,
    finishedAt: data.finished_at,
  })
}

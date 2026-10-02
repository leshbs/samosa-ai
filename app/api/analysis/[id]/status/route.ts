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

  // RLS keeps other tenants out; the filter keeps this to the active
  // workspace, like every other read of a job (ADR-0012).
  const { data, error } = await supabase
    .from('analysis_jobs')
    .select('id, status, processed_count, total_count, error_message, finished_at')
    .eq('id', id)
    .eq('organization_id', session.value.organizationId)
    .maybeSingle()

  if (error)
    return failure(appError(ERROR_CODES.INTERNAL, 'Status analisis tidak bisa dimuat'))
  if (!data)
    return failure(appError(ERROR_CODES.NOT_FOUND, 'Job analisis tidak ditemukan'))

  return success({
    jobId: String(data.id),
    status: data.status,
    processedCount: Number(data.processed_count),
    totalCount: Number(data.total_count),
    errorMessage: data.error_message,
    finishedAt: data.finished_at,
  })
}

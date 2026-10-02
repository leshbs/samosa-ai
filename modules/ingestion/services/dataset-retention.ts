import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { removeDatasetObject } from './dataset-storage'

/**
 * The writes behind retention (ADR-0012). Service role throughout: the sweep
 * runs from a cron with no session, across every tenant, and `datasets` has no
 * update policy for a browser to use anyway.
 *
 * None of these take an organization id, on purpose — they are not reads for
 * a page, and the ids they act on come from the sweep's own listing, never
 * from a request. What happens to which dataset is decided in lib/retention.ts;
 * nothing here knows a plan or a date.
 */

export type RetentionDataset = {
  id: string
  organizationId: string
  name: string
  responseCount: number
  storagePath: string | null
  clockAt: string
  archivedAt: string | null
  stage: number
  notifiedAt: string | null
}

/** Far past a pilot; a sweep that hits it logs so the rest is not forgotten. */
const SWEEP_LIMIT = 5000
const PAGE = 1000

/** Every dataset, oldest clock first. */
export async function listRetentionDatasets(): Promise<
  Result<RetentionDataset[], AppError>
> {
  const supabase = createAdminClient()
  const rows: RetentionDataset[] = []

  for (let from = 0; from < SWEEP_LIMIT; from += PAGE) {
    const { data, error } = await supabase
      .from('datasets')
      .select(
        'id, organization_id, name, response_count, storage_path, retention_clock_at, archived_at, retention_stage, retention_notified_at',
      )
      .order('retention_clock_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)

    if (error) {
      logger.error('ingestion.retention.list_failed', { code: error.code })
      return err(appError(ERROR_CODES.INTERNAL, 'Datasets could not be listed'))
    }

    for (const row of data ?? []) {
      rows.push({
        id: row.id,
        organizationId: row.organization_id,
        name: row.name,
        responseCount: row.response_count,
        storagePath: row.storage_path,
        clockAt: row.retention_clock_at,
        archivedAt: row.archived_at,
        stage: row.retention_stage,
        notifiedAt: row.retention_notified_at,
      })
    }
    if ((data ?? []).length < PAGE) return ok(rows)
  }

  logger.error('ingestion.retention.sweep_limit_reached', { limit: SWEEP_LIMIT })
  return ok(rows)
}

/** Records that the owner was told, which is what lets the next step happen. */
export async function recordRetentionNotice(
  datasetIds: readonly string[],
  stage: number,
  at: Date,
): Promise<boolean> {
  if (datasetIds.length === 0) return true
  const { error } = await createAdminClient()
    .from('datasets')
    .update({ retention_stage: stage, retention_notified_at: at.toISOString() })
    .in('id', [...datasetIds])
  if (error) logger.error('ingestion.retention.notice_failed', { code: error.code })
  return !error
}

/** Hides datasets. The stage is left alone: the owner has not been told yet. */
export async function archiveDatasets(
  datasetIds: readonly string[],
  at: Date,
): Promise<boolean> {
  if (datasetIds.length === 0) return true
  const { error } = await createAdminClient()
    .from('datasets')
    .update({ archived_at: at.toISOString() })
    .in('id', [...datasetIds])
    .is('archived_at', null)
  if (error) logger.error('ingestion.retention.archive_failed', { code: error.code })
  return !error
}

/**
 * Brings datasets back and starts their notices over: whatever deadline they
 * have now is a new one, and deserves its own warnings.
 */
export async function restoreDatasets(datasetIds: readonly string[]): Promise<boolean> {
  if (datasetIds.length === 0) return true
  const { error } = await createAdminClient()
    .from('datasets')
    .update({ archived_at: null, retention_stage: 0, retention_notified_at: null })
    .in('id', [...datasetIds])
  if (error) logger.error('ingestion.retention.restore_failed', { code: error.code })
  return !error
}

/**
 * Deletes archived datasets for good: the rows, and by cascade their
 * responses, analyses and reports, then the raw uploads. Only rows that are
 * still archived go — a dataset restored between the listing and this call is
 * left alone. Returns the ids that were actually deleted.
 */
export async function purgeArchivedDatasets(
  datasets: ReadonlyArray<Pick<RetentionDataset, 'id' | 'storagePath'>>,
): Promise<string[]> {
  if (datasets.length === 0) return []

  const { data, error } = await createAdminClient()
    .from('datasets')
    .delete()
    .in(
      'id',
      datasets.map((dataset) => dataset.id),
    )
    .not('archived_at', 'is', null)
    .select('id, storage_path')

  if (error) {
    logger.error('ingestion.retention.purge_failed', { code: error.code })
    return []
  }

  const deleted = data ?? []
  await Promise.all(deleted.map((row) => removeDatasetObject(row.storage_path)))
  return deleted.map((row) => row.id)
}

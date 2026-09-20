import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { Dataset, DatasetSource, ResponseRecord } from '@/types/domain'

/**
 * Reads go through the request-scoped client, so RLS filters by organization
 * and these functions never have to be trusted with a tenant id.
 */

export const RESPONSES_PAGE_SIZE = 50

type DatasetRow = {
  id: string
  organization_id: string
  uploader_id: string
  name: string
  source: DatasetSource
  storage_path: string | null
  response_count: number
  metadata: unknown
  created_at: string
}

/** metadata is free-form jsonb; read the one key we rely on defensively. */
function textColumnOf(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null
  const value = (metadata as Record<string, unknown>).text_column_name
  return typeof value === 'string' ? value : null
}

function toDataset(row: DatasetRow): Dataset {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    source: row.source,
    storagePath: row.storage_path,
    responseCount: row.response_count,
    uploaderId: row.uploader_id,
    textColumnName: textColumnOf(row.metadata),
    createdAt: row.created_at,
  }
}

const DATASET_COLUMNS =
  'id, organization_id, uploader_id, name, source, storage_path, response_count, metadata, created_at'

export async function listDatasets(): Promise<Result<Dataset[], AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('datasets')
    .select(DATASET_COLUMNS)
    .order('created_at', { ascending: false })

  if (error) {
    return err(appError(ERROR_CODES.INTERNAL, 'Could not load datasets'))
  }

  return ok((data as DatasetRow[]).map(toDataset))
}

export async function getDataset(datasetId: string): Promise<Result<Dataset, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('datasets')
    .select(DATASET_COLUMNS)
    .eq('id', datasetId)
    .maybeSingle()

  // RLS turns "another tenant's dataset" into "no rows", which is what we want.
  if (error || !data) {
    return err(appError(ERROR_CODES.NOT_FOUND, 'Dataset not found'))
  }

  return ok(toDataset(data as DatasetRow))
}

export type ResponsePage = {
  responses: ResponseRecord[]
  total: number
  page: number
  pageCount: number
}

export async function listResponses(
  datasetId: string,
  page = 1,
): Promise<Result<ResponsePage, AppError>> {
  const supabase = await createClient()

  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1
  const from = (safePage - 1) * RESPONSES_PAGE_SIZE

  const { data, error, count } = await supabase
    .from('responses')
    .select('id, dataset_id, organization_id, text, respondent_meta, created_at', {
      count: 'exact',
    })
    .eq('dataset_id', datasetId)
    .order('created_at', { ascending: true })
    .range(from, from + RESPONSES_PAGE_SIZE - 1)

  if (error) {
    return err(appError(ERROR_CODES.INTERNAL, 'Could not load responses'))
  }

  const total = count ?? 0

  return ok({
    responses: (data ?? []).map((row) => ({
      id: String(row.id),
      datasetId: String(row.dataset_id),
      organizationId: String(row.organization_id),
      text: String(row.text),
      respondentMeta: (row.respondent_meta ?? {}) as ResponseRecord['respondentMeta'],
      createdAt: String(row.created_at),
    })),
    total,
    page: safePage,
    pageCount: Math.max(1, Math.ceil(total / RESPONSES_PAGE_SIZE)),
  })
}

/** Responses cascade from the foreign key, so one delete is enough. */
export async function deleteDataset(datasetId: string): Promise<Result<void, AppError>> {
  const supabase = await createClient()

  const { error, count } = await supabase
    .from('datasets')
    .delete({ count: 'exact' })
    .eq('id', datasetId)

  if (error) {
    return err(appError(ERROR_CODES.INTERNAL, 'Could not delete the dataset'))
  }

  // RLS silently drops rows the caller may not delete; report that honestly.
  if (!count) {
    return err(appError(ERROR_CODES.NOT_FOUND, 'Dataset not found'))
  }

  return ok(undefined)
}

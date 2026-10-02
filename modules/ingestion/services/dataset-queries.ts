import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { removeDatasetObject } from './dataset-storage'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { Dataset, DatasetSource, ResponseRecord } from '@/types/domain'

/**
 * Reads go through the request-scoped client, so RLS keeps other tenants out
 * whatever id is passed. The explicit `organizationId` does a different job:
 * RLS admits every workspace the caller belongs to, and a person can be in two
 * (ADR-0012), so each query also names the active one.
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
  retention_clock_at: string
  archived_at: string | null
  created_at: string
}

/**
 * Archived datasets (ADR-0012) are hidden from every page by default. The two
 * callers that want them say so: the settings page that lists what is waiting
 * to be deleted, and the export, which must still contain them.
 */
export type ArchivedFilter = 'exclude' | 'only' | 'include'

/** metadata is free-form jsonb; read the one key we rely on defensively. */
function textColumnOf(metadata: unknown): string | null {
  if (typeof metadata !== 'object' || metadata === null) return null
  const value = (metadata as Record<string, unknown>).text_column_name
  return typeof value === 'string' ? value : null
}

/**
 * The columns the uploader deliberately chose to keep beside the text.
 *
 * Read-only projection of a key `uploadDataset` already writes — nothing new is
 * stored and no behaviour changes. It is surfaced because the dataset page has to
 * answer "what personal data does this dataset hold?" without opening the rows,
 * which is the whole reason `kept_columns` is recorded. An older dataset written
 * before the key existed returns an empty list, which is also the truth for it:
 * those were uploaded under the keep-everything default and the honest answer is
 * on the row, not in the metadata.
 */
function keptColumnsOf(metadata: unknown): string[] {
  if (typeof metadata !== 'object' || metadata === null) return []
  const value = (metadata as Record<string, unknown>).kept_columns
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is string => typeof entry === 'string')
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
    keptColumns: keptColumnsOf(row.metadata),
    retentionClockAt: row.retention_clock_at,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
  }
}

const DATASET_COLUMNS =
  'id, organization_id, uploader_id, name, source, storage_path, response_count, metadata, retention_clock_at, archived_at, created_at'

export async function listDatasets(
  organizationId: string,
  options: { archived?: ArchivedFilter } = {},
): Promise<Result<Dataset[], AppError>> {
  const supabase = await createClient()
  const archived = options.archived ?? 'exclude'

  let query = supabase
    .from('datasets')
    .select(DATASET_COLUMNS)
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
  if (archived === 'exclude') query = query.is('archived_at', null)
  if (archived === 'only') query = query.not('archived_at', 'is', null)

  const { data, error } = await query

  if (error) {
    return err(appError(ERROR_CODES.INTERNAL, 'Daftar dataset tidak bisa dimuat'))
  }

  return ok((data as DatasetRow[]).map(toDataset))
}

/**
 * The badge on the sidebar's "Dataset" entry. The shell renders on every page,
 * so this is a HEAD count rather than `listDatasets().length`: no rows cross
 * the wire just to be counted.
 */
export async function countDatasets(
  organizationId: string,
): Promise<Result<number, AppError>> {
  const supabase = await createClient()

  const { count, error } = await supabase
    .from('datasets')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .is('archived_at', null)

  if (error || count === null) {
    return err(appError(ERROR_CODES.INTERNAL, 'Jumlah dataset tidak bisa dimuat'))
  }

  return ok(count)
}

export async function getDataset(
  organizationId: string,
  datasetId: string,
  options: { includeArchived?: boolean } = {},
): Promise<Result<Dataset, AppError>> {
  const supabase = await createClient()

  let query = supabase
    .from('datasets')
    .select(DATASET_COLUMNS)
    .eq('id', datasetId)
    .eq('organization_id', organizationId)
  // An archived dataset is "not found" to every page; only the export asks.
  if (!options.includeArchived) query = query.is('archived_at', null)

  const { data, error } = await query.maybeSingle()

  // Another tenant's dataset (RLS) and one in the caller's other workspace
  // (the filter) both come back as "no rows", which is what we want.
  if (error || !data) {
    return err(appError(ERROR_CODES.NOT_FOUND, 'Dataset tidak ditemukan'))
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
  organizationId: string,
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
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: true })
    .range(from, from + RESPONSES_PAGE_SIZE - 1)

  if (error) {
    return err(appError(ERROR_CODES.INTERNAL, 'Aspirasi tidak bisa dimuat'))
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

/**
 * Responses, analysis results and reports cascade from the foreign key, so one
 * delete clears the database. The raw upload does not cascade — nothing in
 * Postgres knows about the storage bucket — so it is removed explicitly.
 *
 * That second step is not tidiness. The uploaded file still holds the
 * respondent metadata columns (names, classes) that the analysis pipeline
 * deliberately never sends anywhere, and the privacy policy tells users that
 * deleting a dataset deletes its responses. Leaving the CSV behind makes that
 * sentence false about the most sensitive data in the system.
 *
 * The delete returns the path instead of a count: a row the database refused
 * to delete hands back nothing, so there is no way to remove a file whose
 * dataset the caller was not allowed to touch.
 *
 * The organization filter matters most here. The route checks the caller's
 * role in the active workspace; without the filter, an owner of one workspace
 * could delete by id in another where RLS also lets them — as an admin, say —
 * on the strength of a role check made for the wrong place.
 */
export async function deleteDataset(
  organizationId: string,
  datasetId: string,
): Promise<Result<void, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('datasets')
    .delete()
    .eq('id', datasetId)
    .eq('organization_id', organizationId)
    .select('storage_path')

  if (error) {
    return err(appError(ERROR_CODES.INTERNAL, 'Dataset tidak bisa dihapus'))
  }

  // RLS silently drops rows the caller may not delete; report that honestly.
  const deleted = data?.[0]
  if (!deleted) {
    return err(appError(ERROR_CODES.NOT_FOUND, 'Dataset tidak ditemukan'))
  }

  await removeDatasetObject(deleted.storage_path)

  return ok(undefined)
}

/** PostgREST's default ceiling on rows per response. */
const EXPORT_PAGE_SIZE = 1000
/** 4,000 characters × 50,000 rows is already a 200 MB archive; stop there. */
const MAX_EXPORT_ROWS = 50_000

/**
 * Every response in a dataset, for the organization archive. Paged, because a
 * single select stops silently at 1,000 rows and an export that quietly drops
 * the rest is worse than no export.
 */
export async function listAllResponses(
  organizationId: string,
  datasetId: string,
): Promise<Result<ResponseRecord[], AppError>> {
  const supabase = await createClient()
  const rows: ResponseRecord[] = []

  for (let from = 0; from < MAX_EXPORT_ROWS; from += EXPORT_PAGE_SIZE) {
    const { data, error } = await supabase
      .from('responses')
      .select('id, dataset_id, organization_id, text, respondent_meta, created_at')
      .eq('dataset_id', datasetId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + EXPORT_PAGE_SIZE - 1)

    if (error) return err(appError(ERROR_CODES.INTERNAL, 'Aspirasi tidak bisa dimuat'))

    for (const row of data ?? []) {
      rows.push({
        id: String(row.id),
        datasetId: String(row.dataset_id),
        organizationId: String(row.organization_id),
        text: String(row.text),
        respondentMeta: (row.respondent_meta ?? {}) as ResponseRecord['respondentMeta'],
        createdAt: String(row.created_at),
      })
    }
    if ((data ?? []).length < EXPORT_PAGE_SIZE) break
  }

  return ok(rows)
}

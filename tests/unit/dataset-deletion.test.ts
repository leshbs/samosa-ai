// @vitest-environment node
// uploadDataset needs the real File/arrayBuffer globals.
import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * These tests exist because of a leak found by hand, not by a failing test:
 * deleting a dataset removed every row and left the uploaded CSV — the one
 * file that still holds respondent names — sitting in the bucket. Nothing
 * asserted on storage, so nothing noticed.
 */

const remove = vi.fn()
const storageFrom = vi.fn(() => ({ remove, upload }))
const upload = vi.fn()

const adminFrom = vi.fn()
const requestFrom = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ storage: { from: storageFrom }, from: adminFrom }),
}))

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ from: requestFrom }),
}))

const { deleteDataset } = await import('@/modules/ingestion/services/dataset-queries')
const { uploadDataset } = await import('@/modules/ingestion/services/upload-dataset')

/** Mimics the postgrest builder: delete().eq().select() resolves. */
function deleteBuilder(result: { data?: unknown; error?: unknown }) {
  const builder = {
    delete: () => builder,
    eq: () => builder,
    select: () => Promise.resolve({ data: null, error: null, ...result }),
    then: (resolve: (value: unknown) => unknown) =>
      Promise.resolve({ data: null, error: null, ...result }).then(resolve),
  }
  return builder
}

beforeEach(() => {
  remove.mockReset().mockResolvedValue({ error: null })
  upload.mockReset().mockResolvedValue({ error: null })
  storageFrom.mockClear()
  adminFrom.mockReset()
  requestFrom.mockReset()
})

describe('deleteDataset', () => {
  it('removes the uploaded file along with the rows', async () => {
    requestFrom.mockReturnValue(
      deleteBuilder({ data: [{ storage_path: 'org-1/abc-aspirasi.csv' }] }),
    )

    const result = await deleteDataset('org-1', 'dataset-1')

    expect(result.ok).toBe(true)
    expect(storageFrom).toHaveBeenCalledWith('datasets')
    expect(remove).toHaveBeenCalledWith(['org-1/abc-aspirasi.csv'])
  })

  it('touches no file when RLS refused the delete', async () => {
    requestFrom.mockReturnValue(deleteBuilder({ data: [] }))

    const result = await deleteDataset('org-1', 'someone-elses-dataset')

    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error.code).toBe('NOT_FOUND')
    // The path is unknown precisely because the row was not ours to delete.
    expect(remove).not.toHaveBeenCalled()
  })

  it('still reports success when the bucket is unreachable', async () => {
    // The rows are already gone; failing here would tell the user the dataset
    // still exists, which is worse than an orphaned file plus a loud log.
    requestFrom.mockReturnValue(
      deleteBuilder({ data: [{ storage_path: 'org-1/a.csv' }] }),
    )
    remove.mockResolvedValue({ error: { message: 'bucket down' } })

    const result = await deleteDataset('org-1', 'dataset-1')

    expect(result.ok).toBe(true)
  })

  it('does not call storage for a dataset that has no file', async () => {
    requestFrom.mockReturnValue(deleteBuilder({ data: [{ storage_path: null }] }))

    expect((await deleteDataset('org-1', 'dataset-1')).ok).toBe(true)
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('uploadDataset rollback', () => {
  const input = {
    organizationId: 'org-1',
    uploaderId: 'user-1',
    name: 'Evaluasi Pensi',
    source: 'csv' as const,
    textColumns: ['Aspirasi'],
  }

  function csv(): File {
    return new File(['Aspirasi\nKantin kurang bersih'], 'aspirasi.csv', {
      type: 'text/csv',
    })
  }

  it('deletes the upload when the dataset row cannot be created', async () => {
    adminFrom.mockReturnValue({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: null, error: { message: 'insert failed' } }),
        }),
      }),
    })

    const result = await uploadDataset({ ...input, file: csv() })

    expect(result.ok).toBe(false)
    expect(remove).toHaveBeenCalledTimes(1)
    expect(remove.mock.calls[0]?.[0]?.[0]).toMatch(/^org-1\/.+-aspirasi\.csv$/)
  })

  it('deletes the upload when the responses cannot be stored', async () => {
    const datasetDelete = vi.fn(() => ({ eq: async () => ({ error: null }) }))
    adminFrom.mockImplementation((table: string) =>
      table === 'datasets'
        ? {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'dataset-1' }, error: null }),
              }),
            }),
            delete: datasetDelete,
          }
        : table === 'dataset_questions'
          ? {
              insert: () => ({
                select: async () => ({ data: [{ id: 'q-1', position: 0 }], error: null }),
              }),
            }
          : { insert: async () => ({ error: { message: 'responses failed' } }) },
    )

    const result = await uploadDataset({ ...input, file: csv() })

    expect(result.ok).toBe(false)
    expect(datasetDelete).toHaveBeenCalled()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('deletes the upload when the questions cannot be stored', async () => {
    const datasetDelete = vi.fn(() => ({ eq: async () => ({ error: null }) }))
    const responsesInsert = vi.fn()
    adminFrom.mockImplementation((table: string) =>
      table === 'datasets'
        ? {
            insert: () => ({
              select: () => ({
                single: async () => ({ data: { id: 'dataset-1' }, error: null }),
              }),
            }),
            delete: datasetDelete,
          }
        : table === 'dataset_questions'
          ? {
              insert: () => ({
                select: async () => ({
                  data: null,
                  error: { message: 'questions failed' },
                }),
              }),
            }
          : { insert: responsesInsert },
    )

    const result = await uploadDataset({ ...input, file: csv() })

    expect(result.ok).toBe(false)
    // No answer is stored without the question it answers.
    expect(responsesInsert).not.toHaveBeenCalled()
    expect(datasetDelete).toHaveBeenCalled()
    expect(remove).toHaveBeenCalledTimes(1)
  })

  it('stores each answer under its question, with the sheet row it came from', async () => {
    const questionsInsert = vi.fn((_rows: unknown) => ({
      select: async () => ({
        data: [
          { id: 'q-saran', position: 1 },
          { id: 'q-kritik', position: 0 },
        ],
        error: null,
      }),
    }))
    const responsesInsert = vi.fn(async (_rows: unknown) => ({ error: null }))
    const datasetInsert = vi.fn((_row: unknown) => ({
      select: () => ({
        single: async () => ({ data: { id: 'dataset-1' }, error: null }),
      }),
    }))
    adminFrom.mockImplementation((table: string) =>
      table === 'datasets'
        ? { insert: datasetInsert }
        : table === 'dataset_questions'
          ? { insert: questionsInsert }
          : { insert: responsesInsert },
    )

    const file = new File(
      ['Kritik,Saran\nKonsumsi telat,Tambah vendor\n,Mulai tepat waktu\n'],
      'aspirasi.csv',
      { type: 'text/csv' },
    )
    const result = await uploadDataset({
      ...input,
      textColumns: ['Kritik', 'Saran'],
      file,
    })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value).toMatchObject({
      responseCount: 3,
      respondentCount: 2,
      questionCount: 2,
    })
    expect(questionsInsert.mock.calls[0]?.[0]).toMatchObject([
      { column_name: 'Kritik', question_text: 'Kritik', position: 0 },
      { column_name: 'Saran', question_text: 'Saran', position: 1 },
    ])
    // Matched by position, not by the order the insert happened to return.
    expect(responsesInsert.mock.calls[0]?.[0]).toMatchObject([
      { question_id: 'q-kritik', respondent_index: 0, text: 'Konsumsi telat' },
      { question_id: 'q-saran', respondent_index: 0, text: 'Tambah vendor' },
      { question_id: 'q-saran', respondent_index: 1, text: 'Mulai tepat waktu' },
    ])
    expect(datasetInsert.mock.calls[0]?.[0]).toMatchObject({
      response_count: 3,
      metadata: { text_column_name: 'Kritik', respondent_count: 2 },
    })
  })
})

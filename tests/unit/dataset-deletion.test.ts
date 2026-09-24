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

    const result = await deleteDataset('dataset-1')

    expect(result.ok).toBe(true)
    expect(storageFrom).toHaveBeenCalledWith('datasets')
    expect(remove).toHaveBeenCalledWith(['org-1/abc-aspirasi.csv'])
  })

  it('touches no file when RLS refused the delete', async () => {
    requestFrom.mockReturnValue(deleteBuilder({ data: [] }))

    const result = await deleteDataset('someone-elses-dataset')

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

    const result = await deleteDataset('dataset-1')

    expect(result.ok).toBe(true)
  })

  it('does not call storage for a dataset that has no file', async () => {
    requestFrom.mockReturnValue(deleteBuilder({ data: [{ storage_path: null }] }))

    expect((await deleteDataset('dataset-1')).ok).toBe(true)
    expect(remove).not.toHaveBeenCalled()
  })
})

describe('uploadDataset rollback', () => {
  const input = {
    organizationId: 'org-1',
    uploaderId: 'user-1',
    name: 'Evaluasi Pensi',
    source: 'csv' as const,
    textColumn: 'Aspirasi',
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
        : { insert: async () => ({ error: { message: 'responses failed' } }) },
    )

    const result = await uploadDataset({ ...input, file: csv() })

    expect(result.ok).toBe(false)
    expect(datasetDelete).toHaveBeenCalled()
    expect(remove).toHaveBeenCalledTimes(1)
  })
})

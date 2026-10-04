// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { argsOf, fakeQuery } from '../stubs/fake-query'

/**
 * The analysis side of retention and of the abuse ceiling. Both callers act on
 * the answer — archive the datasets or not, let the upload through or not — so
 * "could not tell" must never read as "nothing to do" or "nothing used".
 */

const from = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))

const { countResponsesSubmittedSince, setJobsArchived } =
  await import('@/modules/analysis/services/job-archive')

beforeEach(() => from.mockReset())

describe('setJobsArchived', () => {
  it('archives the reports of the given datasets', async () => {
    const update = fakeQuery({ error: null })
    from.mockReturnValue(update)
    const at = new Date('2027-10-03T00:00:00.000Z')

    expect(await setJobsArchived(['ds-1', 'ds-2'], at)).toBe(true)
    expect(argsOf(update, 'update')).toEqual([{ archived_at: at.toISOString() }])
    expect(argsOf(update, 'in')).toEqual(['dataset_id', ['ds-1', 'ds-2']])
  })

  it('restores them when given no date', async () => {
    const update = fakeQuery({ error: null })
    from.mockReturnValue(update)

    await setJobsArchived(['ds-1'], null)

    expect(argsOf(update, 'update')).toEqual([{ archived_at: null }])
  })

  it('says so when it failed, so the datasets are not archived without them', async () => {
    from.mockReturnValue(fakeQuery({ error: { code: '57014' } }))

    expect(await setJobsArchived(['ds-1'], new Date())).toBe(false)
  })

  it('does not ask the database about an empty list', async () => {
    expect(await setJobsArchived([], new Date())).toBe(true)
    expect(from).not.toHaveBeenCalled()
  })
})

describe('countResponsesSubmittedSince', () => {
  it('counts what each job was asked to analyse, finished or not', async () => {
    const jobs = fakeQuery({
      data: [{ total_count: 1_200 }, { total_count: 300 }, { total_count: null }],
      error: null,
    })
    from.mockReturnValue(jobs)
    const since = new Date('2026-10-01T00:00:00.000Z')

    expect(await countResponsesSubmittedSince(['org-1', 'org-2'], since)).toBe(1_500)
    expect(argsOf(jobs, 'in')).toEqual(['organization_id', ['org-1', 'org-2']])
    expect(argsOf(jobs, 'gte')).toEqual(['created_at', since.toISOString()])
  })

  it('answers null, not zero, when it could not count', async () => {
    from.mockReturnValue(fakeQuery({ data: null, error: { code: '57014' } }))

    expect(await countResponsesSubmittedSince(['org-1'], new Date())).toBeNull()
  })

  it('is zero for an account with no workspaces', async () => {
    expect(await countResponsesSubmittedSince([], new Date())).toBe(0)
    expect(from).not.toHaveBeenCalled()
  })
})

// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { argsOf, fakeQuery, type FakeQuery } from '../stubs/fake-query'

/**
 * `created_by` arrives with the settings migration. These pin down the
 * promise made in createJob: record the author when the column exists, and
 * never refuse to start an analysis because it does not exist yet.
 */

const from = vi.fn()

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from }) }))
vi.mock('@/modules/analysis/adapters/openai', () => ({ createOpenAiAdapter: vi.fn() }))

const { createJob } = await import('@/modules/analysis/services/job-runner')

const INPUT = { organizationId: 'org-1', datasetId: 'ds-1', createdBy: 'u-1' }
const COUNTED = { count: 12, error: null }
const CREATED = { data: { id: 'job-1', status: 'queued' }, error: null }

beforeEach(() => from.mockReset())

describe('createJob', () => {
  it('records who started the job', async () => {
    const insert = fakeQuery(CREATED)
    const queue: FakeQuery[] = [fakeQuery(COUNTED), insert]
    from.mockImplementation(() => queue.shift())

    const result = await createJob(INPUT)

    expect(result).toEqual({ ok: true, value: { id: 'job-1', status: 'queued' } })
    expect(argsOf(insert, 'insert')?.[0]).toMatchObject({ created_by: 'u-1' })
  })

  it('still starts the job on a database without the column', async () => {
    const refused = fakeQuery({
      data: null,
      error: { code: 'PGRST204', message: "Could not find the 'created_by' column" },
    })
    const retried = fakeQuery(CREATED)
    const queue: FakeQuery[] = [fakeQuery(COUNTED), refused, retried]
    from.mockImplementation(() => queue.shift())

    const result = await createJob(INPUT)

    expect(result.ok).toBe(true)
    expect(argsOf(retried, 'insert')?.[0]).not.toHaveProperty('created_by')
  })

  it('does not retry an unrelated failure', async () => {
    const queue: FakeQuery[] = [
      fakeQuery(COUNTED),
      fakeQuery({ data: null, error: { code: '23503', message: 'fk' } }),
    ]
    from.mockImplementation(() => queue.shift())

    const result = await createJob(INPUT)

    expect(result.ok).toBe(false)
    expect(from).toHaveBeenCalledTimes(2)
  })
})

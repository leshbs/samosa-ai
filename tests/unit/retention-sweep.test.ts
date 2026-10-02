import { beforeEach, describe, expect, it, vi } from 'vitest'

const listRetentionDatasets = vi.fn()
const recordRetentionNotice = vi.fn()
const archiveDatasets = vi.fn()
const restoreDatasets = vi.fn()
const purgeArchivedDatasets = vi.fn()
const setJobsArchived = vi.fn()
const getRetentionPolicies = vi.fn()
const getNotificationTarget = vi.fn()
const isEmailConfigured = vi.fn()
const sendEmail = vi.fn()

vi.mock('@/modules/ingestion', () => ({
  archiveDatasets,
  listRetentionDatasets,
  purgeArchivedDatasets,
  recordRetentionNotice,
  restoreDatasets,
}))
vi.mock('@/modules/analysis', () => ({ setJobsArchived }))
vi.mock('@/modules/auth', () => ({ getNotificationTarget, getRetentionPolicies }))
vi.mock('@/modules/notifications', () => ({
  isEmailConfigured,
  sendEmail,
  retentionNoticeEmail: (input: Record<string, unknown>) => ({
    kind: 'notice',
    ...input,
  }),
  retentionArchivedEmail: (input: Record<string, unknown>) => ({
    kind: 'archived',
    ...input,
  }),
}))
vi.mock('@/lib/env', () => ({
  clientEnv: { NEXT_PUBLIC_APP_URL: 'https://samosa.test' },
}))

const { runRetentionSweep } = await import('@/app/api/_lib/retention-sweep')

const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

function dataset(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    organizationId: 'org-1',
    name: `Survei ${id}`,
    responseCount: 120,
    storagePath: `org-1/${id}.csv`,
    clockAt: '2026-01-01T00:00:00Z',
    archivedAt: null,
    stage: 0,
    notifiedAt: null,
    ...overrides,
  }
}

function policy(retentionDays: number | null, ownerId: string | null = 'u-owner') {
  return new Map([
    [
      'org-1',
      {
        organizationName: 'OSIS Nusantara',
        timezone: 'Asia/Jakarta',
        retentionDays,
        ownerId,
      },
    ],
  ])
}

function sweeping(datasets: unknown[], retentionDays: number | null = 365) {
  listRetentionDatasets.mockResolvedValue({ ok: true, value: datasets })
  getRetentionPolicies.mockResolvedValue(policy(retentionDays))
}

beforeEach(() => {
  for (const mock of [
    listRetentionDatasets,
    recordRetentionNotice,
    archiveDatasets,
    restoreDatasets,
    purgeArchivedDatasets,
    setJobsArchived,
    getRetentionPolicies,
    getNotificationTarget,
    isEmailConfigured,
    sendEmail,
  ]) {
    mock.mockReset()
  }
  recordRetentionNotice.mockResolvedValue(true)
  archiveDatasets.mockResolvedValue(true)
  restoreDatasets.mockResolvedValue(true)
  setJobsArchived.mockResolvedValue(true)
  purgeArchivedDatasets.mockImplementation(async (rows: Array<{ id: string }>) =>
    rows.map((row) => row.id),
  )
  isEmailConfigured.mockReturnValue(true)
  sendEmail.mockResolvedValue({ ok: true, value: { id: 'm-1' } })
  getNotificationTarget.mockResolvedValue({
    email: 'ketua@osis.test',
    displayName: 'Rani',
    notifyAnalysisFinished: false,
  })
})

describe('runRetentionSweep', () => {
  it('does nothing while every dataset is well inside its year', async () => {
    sweeping([dataset('a')])

    const result = await runRetentionSweep(day('2026-06-01'))

    expect(result.ok && result.value).toMatchObject({
      noticed: 0,
      archived: 0,
      deleted: 0,
    })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('sends one notice per workspace, naming every dataset in it', async () => {
    sweeping([dataset('a'), dataset('b')])

    const result = await runRetentionSweep(day('2026-12-05'))

    expect(sendEmail).toHaveBeenCalledTimes(1)
    const [message, kind] = sendEmail.mock.calls[0] as [Record<string, unknown>, string]
    expect(kind).toBe('retention_notice')
    expect(message).toMatchObject({ to: 'ketua@osis.test', final: false })
    expect(message.datasets).toHaveLength(2)
    expect(recordRetentionNotice).toHaveBeenCalledWith(['a', 'b'], 1, day('2026-12-05'))
    expect(result.ok && result.value.noticed).toBe(2)
  })

  it('writes to the owner even if they switched analysis emails off', async () => {
    sweeping([dataset('a')])

    await runRetentionSweep(day('2026-12-05'))

    // notifyAnalysisFinished is false in the fixture; a deletion notice is not optional.
    expect(sendEmail).toHaveBeenCalledTimes(1)
  })

  it('records nothing when the email did not go out', async () => {
    sweeping([dataset('a')])
    sendEmail.mockResolvedValue({ ok: false, error: { code: 'UPSTREAM', message: 'x' } })

    const result = await runRetentionSweep(day('2026-12-05'))

    expect(recordRetentionNotice).not.toHaveBeenCalled()
    expect(result.ok && result.value).toMatchObject({ noticed: 0, held: 1 })
  })

  it('archives reports before datasets, then tells the owner', async () => {
    sweeping([dataset('a', { stage: 2, notifiedAt: '2026-12-20T00:00:00Z' })])
    const order: string[] = []
    setJobsArchived.mockImplementation(async () => (order.push('jobs'), true))
    archiveDatasets.mockImplementation(async () => (order.push('datasets'), true))
    sendEmail.mockImplementation(
      async () => (order.push('email'), { ok: true, value: { id: 'm' } }),
    )

    const now = day('2027-01-02')
    const result = await runRetentionSweep(now)

    expect(order).toEqual(['jobs', 'datasets', 'email'])
    expect(setJobsArchived).toHaveBeenCalledWith(['a'], now)
    expect(archiveDatasets).toHaveBeenCalledWith(['a'], now)
    expect(sendEmail.mock.calls[0]?.[1]).toBe('retention_archived')
    expect(recordRetentionNotice).toHaveBeenCalledWith(['a'], 3, now)
    expect(result.ok && result.value.archived).toBe(1)
  })

  it('deletes only what has been archived, announced, and waited out', async () => {
    const due = dataset('a', {
      archivedAt: '2027-01-01T00:00:00Z',
      stage: 3,
      notifiedAt: '2027-01-01T00:00:00Z',
    })
    sweeping([due])

    const result = await runRetentionSweep(day('2027-04-02'))

    expect(purgeArchivedDatasets).toHaveBeenCalledWith([due])
    expect(sendEmail).not.toHaveBeenCalled()
    expect(result.ok && result.value.deleted).toBe(1)
  })

  it('restores when the account now keeps data, datasets before reports', async () => {
    sweeping([dataset('a', { archivedAt: '2027-01-01T00:00:00Z', stage: 3 })], null)
    const order: string[] = []
    restoreDatasets.mockImplementation(async () => (order.push('datasets'), true))
    setJobsArchived.mockImplementation(async () => (order.push('jobs'), true))

    const result = await runRetentionSweep(day('2027-06-01'))

    expect(order).toEqual(['datasets', 'jobs'])
    expect(setJobsArchived).toHaveBeenCalledWith(['a'], null)
    expect(purgeArchivedDatasets).not.toHaveBeenCalled()
    expect(result.ok && result.value.restored).toBe(1)
  })

  describe('with email switched off', () => {
    beforeEach(() => {
      isEmailConfigured.mockReturnValue(false)
    })

    it('archives nothing and deletes nothing', async () => {
      sweeping([
        dataset('warn'),
        dataset('due', { stage: 2, notifiedAt: '2026-12-20T00:00:00Z' }),
      ])

      const result = await runRetentionSweep(day('2027-02-01'))

      expect(sendEmail).not.toHaveBeenCalled()
      expect(archiveDatasets).not.toHaveBeenCalled()
      expect(setJobsArchived).not.toHaveBeenCalled()
      expect(recordRetentionNotice).not.toHaveBeenCalled()
      expect(result.ok && result.value).toMatchObject({
        emailConfigured: false,
        archived: 0,
        held: 2,
      })
    })

    it('still gives data back', async () => {
      sweeping([dataset('a', { archivedAt: '2027-01-01T00:00:00Z', stage: 3 })], null)

      const result = await runRetentionSweep(day('2027-02-01'))

      expect(result.ok && result.value.restored).toBe(1)
    })
  })

  it('holds a workspace nobody owns rather than archiving unannounced', async () => {
    listRetentionDatasets.mockResolvedValue({
      ok: true,
      value: [dataset('a', { stage: 2, notifiedAt: '2026-12-20T00:00:00Z' })],
    })
    getRetentionPolicies.mockResolvedValue(policy(365, null))

    const result = await runRetentionSweep(day('2027-01-02'))

    expect(archiveDatasets).not.toHaveBeenCalled()
    expect(result.ok && result.value.held).toBe(1)
  })

  it('leaves alone a workspace whose plan could not be read', async () => {
    listRetentionDatasets.mockResolvedValue({
      ok: true,
      value: [dataset('a', { stage: 2, notifiedAt: '2026-01-01T00:00:00Z' })],
    })
    getRetentionPolicies.mockResolvedValue(new Map())

    const result = await runRetentionSweep(day('2030-01-01'))

    expect(sendEmail).not.toHaveBeenCalled()
    expect(archiveDatasets).not.toHaveBeenCalled()
    expect(purgeArchivedDatasets).not.toHaveBeenCalled()
    expect(result.ok && result.value).toMatchObject({ archived: 0, deleted: 0, held: 0 })
  })

  it('retries the announcement of an archive that was never announced', async () => {
    sweeping([
      dataset('a', {
        archivedAt: '2027-01-01T00:00:00Z',
        stage: 2,
        notifiedAt: '2026-12-20T00:00:00Z',
      }),
    ])

    const now = day('2027-01-05')
    await runRetentionSweep(now)

    expect(archiveDatasets).not.toHaveBeenCalled()
    expect(sendEmail.mock.calls[0]?.[1]).toBe('retention_archived')
    expect(recordRetentionNotice).toHaveBeenCalledWith(['a'], 3, now)
  })

  it('fails as a whole when the datasets cannot be listed', async () => {
    listRetentionDatasets.mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: 'x' },
    })

    const result = await runRetentionSweep()

    expect(result.ok).toBe(false)
    expect(getRetentionPolicies).not.toHaveBeenCalled()
  })

  /**
   * The round's acceptance test: one dataset, a store that remembers what the
   * sweep wrote, and the sweep run once a day for as long as it takes.
   */
  describe('day by day', () => {
    type Row = Omit<ReturnType<typeof dataset>, 'archivedAt' | 'notifiedAt'> & {
      archivedAt: string | null
      notifiedAt: string | null
    }
    let store: Row[]
    let retentionDays: number | null
    let log: string[]

    function iso(date: Date) {
      return date.toISOString().slice(0, 10)
    }

    beforeEach(() => {
      store = [dataset('a')]
      retentionDays = 365
      log = []

      listRetentionDatasets.mockImplementation(async () => ({ ok: true, value: store }))
      getRetentionPolicies.mockImplementation(async () => policy(retentionDays))
      recordRetentionNotice.mockImplementation(
        async (_ids: string[], stage: number, at: Date) => {
          store = store.map((row) => ({ ...row, stage, notifiedAt: at.toISOString() }))
          return true
        },
      )
      archiveDatasets.mockImplementation(async (_ids: string[], at: Date) => {
        store = store.map((row) => ({ ...row, archivedAt: at.toISOString() }))
        log.push(`archived ${iso(at)}`)
        return true
      })
      restoreDatasets.mockImplementation(async () => {
        store = store.map((row) => ({
          ...row,
          archivedAt: null,
          stage: 0,
          notifiedAt: null,
        }))
        return true
      })
      purgeArchivedDatasets.mockImplementation(async (rows: Row[]) => {
        store = []
        return rows.map((row) => row.id)
      })
    })

    async function runDaily(from: string, to: string) {
      for (
        let now = day(from);
        now <= day(to);
        now = new Date(now.getTime() + 86_400_000)
      ) {
        const emailsBefore = sendEmail.mock.calls.length
        const before = store.length
        const result = await runRetentionSweep(now)
        if (!result.ok) throw new Error('sweep failed')
        for (const call of sendEmail.mock.calls.slice(emailsBefore)) {
          const message = call[0] as { final?: boolean }
          log.push(
            `${call[1] === 'retention_archived' ? 'told-archived' : message.final ? 'final-notice' : 'first-notice'} ${iso(now)}`,
          )
        }
        if (result.value.restored > 0) log.push(`restored ${iso(now)}`)
        if (store.length < before) log.push(`deleted ${iso(now)}`)
      }
    }

    it('warns twice, archives, and deletes ninety days later', async () => {
      await runDaily('2026-11-01', '2027-04-10')

      expect(log).toEqual([
        'first-notice 2026-12-02',
        'final-notice 2026-12-25',
        'archived 2027-01-01',
        'told-archived 2027-01-01',
        'deleted 2027-04-01',
      ])
      expect(store).toEqual([])
    })

    it('gives everything back when the plan is upgraded before deletion', async () => {
      await runDaily('2026-11-01', '2027-02-01')
      expect(store[0]?.archivedAt).not.toBeNull()

      retentionDays = null
      await runDaily('2027-02-02', '2027-06-01')

      expect(log.at(-1)).toBe('restored 2027-02-02')
      expect(store[0]).toMatchObject({ archivedAt: null, stage: 0, notifiedAt: null })
      expect(purgeArchivedDatasets).not.toHaveBeenCalled()
    })

    it('with email off, a year and a half passes and nothing is touched', async () => {
      isEmailConfigured.mockReturnValue(false)

      await runDaily('2026-11-01', '2028-06-01')

      expect(log).toEqual([])
      expect(store[0]).toMatchObject({ archivedAt: null, stage: 0 })
    })
  })
})

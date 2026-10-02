import { beforeEach, describe, expect, it, vi } from 'vitest'

const getAccountScope = vi.fn()
const countResponsesSubmittedSince = vi.fn()
const getDataset = vi.fn()

vi.mock('@/modules/auth', () => ({ getAccountScope }))
vi.mock('@/modules/analysis', () => ({ countResponsesSubmittedSince }))
vi.mock('@/modules/ingestion', () => ({ getDataset }))

const { checkMonthlyCap } = await import('@/app/api/_lib/abuse-cap')

const NOW = new Date('2026-10-17T09:00:00Z')

function account(cap: number | null, organizationIds = ['org-1', 'org-2']) {
  getAccountScope.mockResolvedValue({
    accountId: 'acct-1',
    plan: 'free',
    limits: { monthlyResponseCap: cap },
    organizationIds,
  })
}

function datasetOf(responseCount: number) {
  getDataset.mockResolvedValue({ ok: true, value: { responseCount } })
}

beforeEach(() => {
  getAccountScope.mockReset()
  countResponsesSubmittedSince.mockReset()
  getDataset.mockReset()
})

describe('checkMonthlyCap', () => {
  it('lets an ordinary month through', async () => {
    account(50_000)
    countResponsesSubmittedSince.mockResolvedValue(1_200)
    datasetOf(300)

    expect((await checkMonthlyCap('org-1', 'd-1', NOW)).ok).toBe(true)
  })

  it('counts every workspace on the account, from the first of the month', async () => {
    account(50_000)
    countResponsesSubmittedSince.mockResolvedValue(0)
    datasetOf(10)

    await checkMonthlyCap('org-1', 'd-1', NOW)

    expect(countResponsesSubmittedSince).toHaveBeenCalledWith(
      ['org-1', 'org-2'],
      new Date('2026-10-01T00:00:00Z'),
    )
  })

  it('stops the run that would cross the ceiling', async () => {
    account(50_000)
    countResponsesSubmittedSince.mockResolvedValue(49_900)
    datasetOf(101)

    const result = await checkMonthlyCap('org-1', 'd-1', NOW)

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('RATE_LIMITED')
      // An abuse limit: no numbers for anyone to plan around.
      expect(result.error.message).not.toMatch(/\d/)
      expect(result.error.message).toContain('Hubungi kami')
    }
  })

  it('allows a run that lands exactly on it', async () => {
    account(50_000)
    countResponsesSubmittedSince.mockResolvedValue(49_900)
    datasetOf(100)

    expect((await checkMonthlyCap('org-1', 'd-1', NOW)).ok).toBe(true)
  })

  it('does not apply to an account with no ceiling', async () => {
    account(null)

    expect((await checkMonthlyCap('org-1', 'd-1', NOW)).ok).toBe(true)
    expect(countResponsesSubmittedSince).not.toHaveBeenCalled()
  })

  it('fails open when the month cannot be counted', async () => {
    account(50_000)
    countResponsesSubmittedSince.mockResolvedValue(null)
    datasetOf(10)

    expect((await checkMonthlyCap('org-1', 'd-1', NOW)).ok).toBe(true)
  })

  it('fails open when the account cannot be read', async () => {
    getAccountScope.mockResolvedValue(null)

    expect((await checkMonthlyCap('org-1', 'd-1', NOW)).ok).toBe(true)
  })

  it('still refuses an account already over, whatever the dataset', async () => {
    account(50_000)
    countResponsesSubmittedSince.mockResolvedValue(50_001)
    getDataset.mockResolvedValue({
      ok: false,
      error: { code: 'NOT_FOUND', message: 'x' },
    })

    expect((await checkMonthlyCap('org-1', 'd-1', NOW)).ok).toBe(false)
  })
})

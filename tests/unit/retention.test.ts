import { describe, expect, it } from 'vitest'
import {
  ARCHIVE_GRACE_DAYS,
  daysUntil,
  deletionDate,
  isNearDeadline,
  nextRetentionStep,
  retentionDeadline,
  type RetentionState,
} from '@/lib/retention'

const YEAR = 365
const day = (iso: string) => new Date(`${iso}T00:00:00Z`)

/** A dataset whose retention clock started on 1 January 2026. */
function dataset(overrides: Partial<RetentionState> = {}): RetentionState {
  return {
    clockAt: '2026-01-01T00:00:00Z',
    archivedAt: null,
    stage: 0,
    notifiedAt: null,
    ...overrides,
  }
}

describe('retentionDeadline', () => {
  it('is the clock plus the plan period', () => {
    expect(retentionDeadline('2026-01-01T00:00:00Z', YEAR)?.toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    )
  })

  it('does not exist on a plan that keeps data', () => {
    expect(retentionDeadline('2026-01-01T00:00:00Z', null)).toBeNull()
  })
})

describe('isNearDeadline', () => {
  const deadline = day('2027-01-01')

  it('starts thirty days before', () => {
    expect(isNearDeadline(deadline, day('2026-12-01'))).toBe(false)
    expect(isNearDeadline(deadline, day('2026-12-02'))).toBe(true)
    expect(isNearDeadline(deadline, day('2027-02-01'))).toBe(true)
  })

  it('never warns without a deadline', () => {
    expect(isNearDeadline(null, day('2099-01-01'))).toBe(false)
  })

  it('counts whole days', () => {
    expect(daysUntil(deadline, day('2026-12-25'))).toBe(7)
  })
})

describe('nextRetentionStep', () => {
  it('leaves a dataset alone for most of its year', () => {
    expect(nextRetentionStep(dataset(), YEAR, day('2026-11-30'))).toEqual({
      kind: 'none',
    })
  })

  it('never touches a dataset on a plan that keeps data', () => {
    expect(nextRetentionStep(dataset(), null, day('2099-01-01'))).toEqual({
      kind: 'none',
    })
  })

  it('sends the first notice thirty days before the deadline', () => {
    expect(nextRetentionStep(dataset(), YEAR, day('2026-12-02'))).toEqual({
      kind: 'notify',
      stage: 1,
    })
  })

  it('waits for the last week before the final notice', () => {
    const noticed = dataset({ stage: 1, notifiedAt: '2026-12-02T00:00:00Z' })

    expect(nextRetentionStep(noticed, YEAR, day('2026-12-20'))).toEqual({ kind: 'none' })
    expect(nextRetentionStep(noticed, YEAR, day('2026-12-25'))).toEqual({
      kind: 'notify',
      stage: 2,
    })
  })

  it('archives on the deadline once the final notice is a week old', () => {
    const warned = dataset({ stage: 2, notifiedAt: '2026-12-25T00:00:00Z' })

    expect(nextRetentionStep(warned, YEAR, day('2026-12-31'))).toEqual({ kind: 'none' })
    expect(nextRetentionStep(warned, YEAR, day('2027-01-01'))).toEqual({
      kind: 'archive',
    })
  })

  it('does not archive on a deadline nobody was warned about', () => {
    // The sweep was down, or email was off, for the whole run-up.
    expect(nextRetentionStep(dataset(), YEAR, day('2027-03-01'))).toEqual({
      kind: 'notify',
      stage: 1,
    })
  })

  it('gives a late final notice its full seven days', () => {
    const late = dataset({ stage: 2, notifiedAt: '2027-03-02T00:00:00Z' })

    expect(nextRetentionStep(late, YEAR, day('2027-03-08'))).toEqual({ kind: 'none' })
    expect(nextRetentionStep(late, YEAR, day('2027-03-09'))).toEqual({ kind: 'archive' })
  })

  it('takes one step per run, even when every date has passed', () => {
    const steps: string[] = []
    let state = dataset()
    const now = day('2028-01-01')

    for (let run = 0; run < 3; run += 1) {
      const step = nextRetentionStep(state, YEAR, now)
      steps.push(step.kind)
      if (step.kind === 'notify') {
        state = { ...state, stage: step.stage, notifiedAt: now.toISOString() }
      }
    }

    // Two notices, then it waits out the week: never notice-archive-delete in one go.
    expect(steps).toEqual(['notify', 'notify', 'none'])
  })

  describe('once archived', () => {
    const archived = dataset({
      archivedAt: '2027-01-01T00:00:00Z',
      stage: 3,
      notifiedAt: '2027-01-01T00:00:00Z',
    })

    it('keeps it for ninety days', () => {
      expect(deletionDate('2027-01-01T00:00:00Z').toISOString()).toBe(
        '2027-04-01T00:00:00.000Z',
      )
      expect(ARCHIVE_GRACE_DAYS).toBe(90)
      expect(nextRetentionStep(archived, YEAR, day('2027-03-31'))).toEqual({
        kind: 'none',
      })
      expect(nextRetentionStep(archived, YEAR, day('2027-04-01'))).toEqual({
        kind: 'delete',
      })
    })

    it('does not delete what the owner was never told is archived', () => {
      const unannounced = { ...archived, stage: 2, notifiedAt: '2026-12-25T00:00:00Z' }

      expect(nextRetentionStep(unannounced, YEAR, day('2028-01-01'))).toEqual({
        kind: 'announce-archive',
      })
    })

    it('counts the ninety days from when the owner was told', () => {
      const toldLate = { ...archived, notifiedAt: '2027-02-01T00:00:00Z' }

      expect(nextRetentionStep(toldLate, YEAR, day('2027-04-15'))).toEqual({
        kind: 'none',
      })
      expect(nextRetentionStep(toldLate, YEAR, day('2027-05-02'))).toEqual({
        kind: 'delete',
      })
    })

    it('comes back when the account moves to a plan that keeps data', () => {
      expect(nextRetentionStep(archived, null, day('2027-02-01'))).toEqual({
        kind: 'restore',
      })
    })

    it('comes back when the period was extended past today', () => {
      expect(nextRetentionStep(archived, YEAR * 3, day('2027-02-01'))).toEqual({
        kind: 'restore',
      })
    })

    it('restores even on the day it would have been deleted', () => {
      expect(nextRetentionStep(archived, null, day('2027-06-01'))).toEqual({
        kind: 'restore',
      })
    })
  })
})

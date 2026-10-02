import { describe, expect, it } from 'vitest'
import { PLAN_DEFAULTS, isAccountPlan, resolveLimits, withinLimit } from '@/lib/plans'

describe('resolveLimits', () => {
  it('returns the plan defaults when there are no overrides', () => {
    expect(resolveLimits('free')).toEqual(PLAN_DEFAULTS.free)
    expect(resolveLimits('org', {})).toEqual(PLAN_DEFAULTS.org)
  })

  it('treats an unknown or missing plan as free, never as something wider', () => {
    expect(resolveLimits(undefined)).toEqual(PLAN_DEFAULTS.free)
    expect(resolveLimits('platinum')).toEqual(PLAN_DEFAULTS.free)
  })

  it('lets an account override one limit and keep the rest', () => {
    const limits = resolveLimits('free', { maxMembersPerWorkspace: 5 })

    expect(limits.maxMembersPerWorkspace).toBe(5)
    expect(limits.retentionDays).toBe(PLAN_DEFAULTS.free.retentionDays)
  })

  it('accepts null as "no limit", but only when it is written as null', () => {
    expect(resolveLimits('free', { retentionDays: null }).retentionDays).toBeNull()
  })

  it('ignores a mistyped value instead of lifting the limit', () => {
    // accounts.limits is edited by hand; "10" or -1 must not become "unlimited".
    const limits = resolveLimits('free', {
      maxMembersPerWorkspace: '10',
      maxWorkspaces: -1,
      retentionDays: 0,
      monthlyResponseCap: 1.5,
      somethingElse: 99,
    })

    expect(limits).toEqual(PLAN_DEFAULTS.free)
  })

  it('ignores overrides that are not an object', () => {
    expect(resolveLimits('org', null)).toEqual(PLAN_DEFAULTS.org)
    expect(resolveLimits('org', [1, 2])).toEqual(PLAN_DEFAULTS.org)
    expect(resolveLimits('org', 'maxWorkspaces=9')).toEqual(PLAN_DEFAULTS.org)
  })

  it('does not hand back the shared defaults object', () => {
    const limits = resolveLimits('free')
    limits.maxWorkspaces = 99

    expect(PLAN_DEFAULTS.free.maxWorkspaces).toBe(1)
  })
})

describe('withinLimit', () => {
  it('admits the third member of a free workspace and refuses the fourth', () => {
    const { maxMembersPerWorkspace } = PLAN_DEFAULTS.free

    expect(withinLimit(maxMembersPerWorkspace, 2)).toBe(true)
    expect(withinLimit(maxMembersPerWorkspace, 3)).toBe(false)
  })

  it('never refuses when there is no limit', () => {
    expect(withinLimit(null, 10_000)).toBe(true)
  })
})

describe('isAccountPlan', () => {
  it('knows the three plans and nothing else', () => {
    expect(isAccountPlan('free')).toBe(true)
    expect(isAccountPlan('enterprise')).toBe(true)
    expect(isAccountPlan('pro')).toBe(false)
    expect(isAccountPlan(null)).toBe(false)
  })
})

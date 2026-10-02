import { z } from 'zod'

/**
 * What each plan allows (ADR-0012, docs/workspace-plan.md).
 *
 * The defaults live here rather than in the database so a change to a plan is
 * a reviewed diff. `accounts.limits` holds per-account exceptions — a school
 * that negotiated a fourth member, a pilot that was promised permanent
 * retention — and wins over the default key by key.
 *
 * `null` means "no limit". Nothing here is read by an RLS policy: limits are a
 * product rule enforced in services, not an access boundary.
 */

export const ACCOUNT_PLANS = ['free', 'org', 'enterprise'] as const
export type AccountPlan = (typeof ACCOUNT_PLANS)[number]

export function isAccountPlan(value: unknown): value is AccountPlan {
  return typeof value === 'string' && (ACCOUNT_PLANS as readonly string[]).includes(value)
}

export type PlanLimits = {
  /** People in one workspace, the owner included. */
  maxMembersPerWorkspace: number | null
  /** Workspaces one account may own. */
  maxWorkspaces: number | null
  /** Days a dataset is kept before it is archived. */
  retentionDays: number | null
  /**
   * Abuse ceiling, not a quota: never shown to users, and high enough that a
   * school running honest surveys does not meet it.
   */
  monthlyResponseCap: number | null
}

const ABUSE_CAP = 50_000

export const PLAN_DEFAULTS: Record<AccountPlan, PlanLimits> = {
  free: {
    maxMembersPerWorkspace: 3,
    maxWorkspaces: 1,
    retentionDays: 365,
    monthlyResponseCap: ABUSE_CAP,
  },
  org: {
    maxMembersPerWorkspace: null,
    maxWorkspaces: 3,
    retentionDays: null,
    monthlyResponseCap: ABUSE_CAP,
  },
  enterprise: {
    maxMembersPerWorkspace: null,
    maxWorkspaces: null,
    retentionDays: null,
    monthlyResponseCap: null,
  },
}

const limit = z.number().int().positive().nullable()

/**
 * `accounts.limits` is edited by hand in the SQL Editor, so it is parsed key
 * by key: one mistyped value must not discard the override next to it, and
 * must never widen a limit to "none" by accident.
 */
const OVERRIDE_KEYS = [
  'maxMembersPerWorkspace',
  'maxWorkspaces',
  'retentionDays',
  'monthlyResponseCap',
] as const satisfies ReadonlyArray<keyof PlanLimits>

export function resolveLimits(plan: unknown, overrides: unknown = {}): PlanLimits {
  const limits = { ...PLAN_DEFAULTS[isAccountPlan(plan) ? plan : 'free'] }
  if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides)) {
    return limits
  }

  const record = overrides as Record<string, unknown>
  for (const key of OVERRIDE_KEYS) {
    if (!(key in record)) continue
    const parsed = limit.safeParse(record[key])
    if (parsed.success) limits[key] = parsed.data
  }
  return limits
}

/** `true` when `count` more would still fit under `max`. */
export function withinLimit(max: number | null, count: number): boolean {
  return max === null || count < max
}

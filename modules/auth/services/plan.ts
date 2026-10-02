import 'server-only'

import {
  isAccountPlan,
  resolveLimits,
  type AccountPlan,
  type PlanLimits,
} from '@/lib/plans'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { logger } from '@/modules/shared'

/**
 * Which plan a workspace is on (ADR-0012). The plan belongs to the account;
 * a workspace reaches it through `organizations.account_id`.
 *
 * An account that cannot be read resolves to the free plan. That is the
 * strict reading for seats and the honest one for retention: nobody is told
 * their data is kept forever because a query failed.
 */
export type WorkspacePlan = {
  plan: AccountPlan
  limits: PlanLimits
}

function toPlan(account: { plan?: unknown; limits?: unknown } | null): WorkspacePlan {
  const plan = isAccountPlan(account?.plan) ? account.plan : 'free'
  return { plan, limits: resolveLimits(plan, account?.limits) }
}

/** For the pages of one workspace, read under RLS as one of its members. */
export async function getWorkspacePlan(organizationId: string): Promise<WorkspacePlan> {
  const supabase = await createClient()

  const { data: organization } = await supabase
    .from('organizations')
    .select('account_id')
    .eq('id', organizationId)
    .maybeSingle()
  if (!organization?.account_id) return toPlan(null)

  const { data: account } = await supabase
    .from('accounts')
    .select('plan, limits')
    .eq('id', organization.account_id)
    .maybeSingle()

  return toPlan(account)
}

export type AccountScope = WorkspacePlan & {
  accountId: string
  /** Every workspace billed to the account, the caller's or not. */
  organizationIds: string[]
}

/**
 * The account behind a workspace and everything else on it. Service role: an
 * abuse ceiling is counted per account, and a member of one workspace cannot
 * see the account owner's others. Returns ids only, and only to server code
 * that has already authenticated the caller as a member of `organizationId`.
 */
export async function getAccountScope(
  organizationId: string,
): Promise<AccountScope | null> {
  const supabase = createAdminClient()

  const { data: organization } = await supabase
    .from('organizations')
    .select('account_id')
    .eq('id', organizationId)
    .maybeSingle()
  if (!organization?.account_id) return null

  const [{ data: account }, { data: siblings }] = await Promise.all([
    supabase
      .from('accounts')
      .select('plan, limits')
      .eq('id', organization.account_id)
      .maybeSingle(),
    supabase.from('organizations').select('id').eq('account_id', organization.account_id),
  ])

  return {
    ...toPlan(account),
    accountId: organization.account_id,
    organizationIds: (siblings ?? []).map((row) => row.id),
  }
}

export type RetentionPolicy = {
  organizationName: string
  /** Raw column value; the caller validates it against the known zones. */
  timezone: unknown
  retentionDays: number | null
  /** Whom to write to about this workspace's data; null if nobody owns it. */
  ownerId: string | null
}

/**
 * What the retention sweep needs to know about each workspace. Service role:
 * the sweep runs from a cron, across tenants, with no session. A workspace
 * whose account could not be read is left out, and the sweep then does nothing
 * to its data — the opposite default from `toPlan`, because here the mistake
 * to avoid is archiving on a guess.
 */
export async function getRetentionPolicies(
  organizationIds: readonly string[],
): Promise<Map<string, RetentionPolicy>> {
  const ids = [...new Set(organizationIds)]
  const policies = new Map<string, RetentionPolicy>()
  if (ids.length === 0) return policies

  const supabase = createAdminClient()
  const [organizations, owners] = await Promise.all([
    supabase.from('organizations').select('*').in('id', ids),
    supabase
      .from('organization_members')
      .select('organization_id, user_id')
      .eq('role', 'owner')
      .in('organization_id', ids),
  ])
  if (organizations.error || owners.error || !organizations.data) {
    logger.error('auth.retention.policies_failed', {
      code: organizations.error?.code ?? owners.error?.code,
    })
    return policies
  }

  const accountIds = [...new Set(organizations.data.map((row) => row.account_id))]
  const accounts = await supabase
    .from('accounts')
    .select('id, plan, limits')
    .in('id', accountIds)
  if (accounts.error || !accounts.data) {
    logger.error('auth.retention.policies_failed', { code: accounts.error?.code })
    return policies
  }

  const accountById = new Map(accounts.data.map((row) => [row.id, row]))
  const ownerOf = new Map(
    (owners.data ?? []).map((row) => [row.organization_id, row.user_id]),
  )

  for (const organization of organizations.data) {
    const account = accountById.get(organization.account_id)
    if (!account) continue
    policies.set(organization.id, {
      organizationName: organization.name,
      timezone: organization.timezone,
      retentionDays: toPlan(account).limits.retentionDays,
      ownerId: ownerOf.get(organization.id) ?? null,
    })
  }
  return policies
}

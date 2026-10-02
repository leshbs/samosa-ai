import 'server-only'

import { isAccountPlan, resolveLimits, withinLimit, type AccountPlan } from '@/lib/plans'
import { createClient } from '@/lib/supabase/server'

/**
 * How many people a workspace holds against how many its plan allows
 * (ADR-0012). A pending invitation counts as a seat: the fourth person on a
 * three-person plan should hear "no" when they are invited, not when they
 * click the link a week later.
 *
 * Read under RLS as an owner or admin — the only people who invite, and the
 * only ones who can see invitations. A product rule, not an access boundary:
 * nothing here stops a member from reading what they already can.
 */
export type WorkspaceCapacity = {
  plan: AccountPlan
  members: number
  /** Live invitations: not accepted, not revoked, not expired. */
  pending: number
  /** `null` is "no limit". */
  maxMembers: number | null
  /** Whether one more invitation fits. */
  hasRoom: boolean
}

export async function getWorkspaceCapacity(
  organizationId: string,
): Promise<WorkspaceCapacity> {
  const supabase = await createClient()

  const [members, pending, organization] = await Promise.all([
    supabase
      .from('organization_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    supabase
      .from('organization_invitations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString()),
    supabase
      .from('organizations')
      .select('account_id')
      .eq('id', organizationId)
      .maybeSingle(),
  ])

  const accountId = organization.data?.account_id
  const { data: account } = accountId
    ? await supabase
        .from('accounts')
        .select('plan, limits')
        .eq('id', accountId)
        .maybeSingle()
    : { data: null }

  // An account that cannot be read resolves to the free plan's limits: the
  // mistake to avoid is handing out seats nobody is paying for.
  const plan = isAccountPlan(account?.plan) ? account.plan : 'free'
  const { maxMembersPerWorkspace } = resolveLimits(plan, account?.limits)
  const memberCount = members.count ?? 0
  const pendingCount = pending.count ?? 0

  return {
    plan,
    members: memberCount,
    pending: pendingCount,
    maxMembers: maxMembersPerWorkspace,
    hasRoom: withinLimit(maxMembersPerWorkspace, memberCount + pendingCount),
  }
}

/** The sentence for a full workspace; says what is in the way and what helps. */
export function describeFullWorkspace(capacity: WorkspaceCapacity): string {
  const waiting =
    capacity.pending > 0 ? ` dan ${capacity.pending} undangan yang menunggu` : ''
  const freeUp =
    capacity.pending > 0
      ? 'Batalkan undangan yang tidak terpakai, atau hubungi kami'
      : 'Hubungi kami'
  return `Paketmu mencakup ${capacity.maxMembers} orang per ruang kerja, dan di sini sudah ada ${capacity.members} anggota${waiting}. ${freeUp} untuk paket yang tidak membatasi jumlah anggota.`
}

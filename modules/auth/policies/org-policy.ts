import type { OrgRole } from '@/types/domain'

export const PERMISSIONS = [
  'dataset:create',
  'dataset:delete',
  'analysis:run',
  'report:export',
  'member:invite',
  /** Change someone's role or remove them. Never the owner: see transfer. */
  'member:manage',
  /** Download everything the organization holds as one archive. */
  'org:export',
  /** Name, logo, timezone, report defaults, transfer, delete. */
  'org:manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Authorization lives here, not in route handlers, so the same rules apply to
 * background jobs that use the service-role client and bypass RLS.
 *
 * Mirrors the RLS policies in supabase/migrations: `org:manage` is owner-only
 * there too, and membership writes are owner/admin and never touch the owner's
 * row. When the two disagree the database wins, so keep them in step.
 */
const PERMISSIONS_BY_ROLE: Record<OrgRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  // Checklist 5.3: "everything except managing the organisation".
  admin: [
    'dataset:create',
    'dataset:delete',
    'analysis:run',
    'report:export',
    'member:invite',
    'member:manage',
    'org:export',
  ],
  member: ['dataset:create', 'analysis:run', 'report:export'],
  viewer: ['report:export'],
}

export function can(role: OrgRole, permission: Permission): boolean {
  return PERMISSIONS_BY_ROLE[role].includes(permission)
}

export function belongsToOrganization(
  actorOrganizationId: string,
  resourceOrganizationId: string,
): boolean {
  return actorOrganizationId === resourceOrganizationId
}

import type { OrgRole } from '@/types/domain'

export const PERMISSIONS = [
  'dataset:create',
  'dataset:delete',
  'analysis:run',
  'report:export',
  'member:invite',
  'org:manage',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Authorization lives here, not in route handlers, so the same rules apply to
 * background jobs that use the service-role client and bypass RLS.
 */
const PERMISSIONS_BY_ROLE: Record<OrgRole, readonly Permission[]> = {
  owner: PERMISSIONS,
  admin: [
    'dataset:create',
    'dataset:delete',
    'analysis:run',
    'report:export',
    'member:invite',
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

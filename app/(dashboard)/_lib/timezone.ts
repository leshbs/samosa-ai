import { getSessionUser } from '@/modules/auth'
import { DEFAULT_TIME_ZONE, type OrgTimeZone } from '@/types/domain'

/**
 * The zone this organization prints dates in. getSessionUser is memoized per
 * render, so a page calling this next to the layout's own call costs nothing.
 */
export async function organizationTimezone(): Promise<OrgTimeZone> {
  const session = await getSessionUser()
  return session.ok ? session.value.organizationTimezone : DEFAULT_TIME_ZONE
}

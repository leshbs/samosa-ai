/** Public API of the auth module. */
export { getAuthUser, getSessionUser, requireSessionUser } from './services/session'
export type { AuthUser, SessionUser } from './services/session'
export { provisionOrganization } from './services/provision'
export { updateDisplayName } from './services/profile'
export { renameOrganization } from './services/organization'
export type { ProvisionInput } from './services/provision'
export {
  EMAIL_LINK_TYPES,
  completeSignIn,
  exchangeAuthCode,
  verifyEmailLink,
} from './services/sign-in'
export type { EmailLinkType } from './services/sign-in'
export { slugify } from './services/slug'
export { can, belongsToOrganization, PERMISSIONS } from './policies/org-policy'
export type { Permission } from './policies/org-policy'

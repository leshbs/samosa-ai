/** Public API of the auth module. */
export { getAuthUser, getSessionUser, requireSessionUser } from './services/session'
export type { AuthUser, SessionUser, WorkspaceSummary } from './services/session'
export { ACTIVE_WORKSPACE_COOKIE, setActiveWorkspace } from './services/active-workspace'
export { createWorkspace, provisionOrganization } from './services/provision'
export { describeFullWorkspace, getWorkspaceCapacity } from './services/capacity'
export type { WorkspaceCapacity } from './services/capacity'
export type { ProvisionInput } from './services/provision'
export {
  getNotificationTarget,
  getPeople,
  getProfileDetails,
  updateProfile,
} from './services/profile'
export type {
  NotificationTarget,
  PersonSummary,
  Profile,
  ProfileDetails,
  ProfilePatch,
} from './services/profile'
export {
  confirmationMatches,
  deleteOrganization,
  getOrganizationSettings,
  updateOrganization,
} from './services/organization'
export type { OrganizationActor, OrganizationSettings } from './services/organization'
export {
  changeMemberRole,
  leaveWorkspace,
  listMembers,
  removeMember,
  transferOwnership,
} from './services/members'
export type { MemberActor, MemberView } from './services/members'
export {
  INVITATION_TTL_DAYS,
  acceptInvitation,
  createInvitation,
  findWorkspaceToLeave,
  getInvitationPreview,
  listIncomingInvitations,
  listPendingInvitations,
  maskEmail,
  revokeInvitation,
} from './services/invitations'
export type {
  CreatedInvitation,
  IncomingInvitation,
  InvitationPreview,
  InvitationStatus,
  InvitationView,
  WorkspaceToLeave,
} from './services/invitations'
export {
  clearAvatar,
  clearOrganizationLogo,
  detectImageFormat,
  readOrganizationLogo,
  setAvatar,
  setOrganizationLogo,
  signBrandingUrl,
} from './services/branding'
export type { ImageFormat, LogoImage } from './services/branding'
export {
  EMAIL_LINK_TYPES,
  completeSignIn,
  exchangeAuthCode,
  isJoining,
  verifyEmailLink,
} from './services/sign-in'
export type { EmailLinkType, SignInOptions } from './services/sign-in'
export { slugify } from './services/slug'
export { can, belongsToOrganization, PERMISSIONS } from './policies/org-policy'
export type { Permission } from './policies/org-policy'

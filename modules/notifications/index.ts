/** Public API of the notifications module: email transport and templates. */
export { isEmailConfigured, sendEmail } from './services/email'
export type { EmailMessage } from './services/email'
export {
  analysisFinishedEmail,
  invitationEmail,
  ownershipTransferredEmail,
  retentionArchivedEmail,
  retentionNoticeEmail,
} from './templates/messages'
export type {
  AnalysisFinishedInput,
  FinishedStatus,
  InvitationEmailInput,
  OwnershipEmailInput,
  RetentionArchivedInput,
  RetentionDatasetLine,
  RetentionNoticeInput,
} from './templates/messages'
export { escapeHtml, renderEmail } from './templates/layout'
export type { RenderedEmail } from './templates/layout'

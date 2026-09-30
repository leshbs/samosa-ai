import { getJobSnapshot } from '@/modules/analysis'
import { getNotificationTarget, type SessionUser } from '@/modules/auth'
import {
  analysisFinishedEmail,
  invitationEmail,
  isEmailConfigured,
  ownershipTransferredEmail,
  sendEmail,
  type FinishedStatus,
} from '@/modules/notifications'
import { logger } from '@/modules/shared'
import { clientEnv } from '@/lib/env'
import { formatDateTime } from '@/lib/utils'
import {
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  isOrgTimeZone,
  type InvitableRole,
} from '@/types/domain'

/**
 * Where the modules meet the mailbox. Each helper reads what it needs from the
 * module that owns it, renders a template, and sends — the composition that
 * no single module may do, since notifications must not depend on analysis
 * or auth and neither of them should know about email.
 *
 * Every helper swallows its own failure: the thing being announced has
 * already happened, and an unsent email must never make it look as if it had
 * not.
 */

export type EmailOutcome = 'sent' | 'off' | 'failed'

function appUrl(path: string): string {
  return new URL(path, clientEnv.NEXT_PUBLIC_APP_URL).toString()
}

export function invitationUrl(token: string): string {
  return appUrl(`/invite/${token}`)
}

export async function sendInvitationEmail(input: {
  to: string
  token: string
  role: InvitableRole
  expiresAt: string
  inviter: SessionUser
}): Promise<EmailOutcome> {
  if (!isEmailConfigured()) return 'off'

  const message = invitationEmail({
    organizationName: input.inviter.organizationName,
    inviterName: input.inviter.displayName,
    roleLabel: ROLE_LABELS[input.role],
    roleDescription: ROLE_DESCRIPTIONS[input.role],
    url: invitationUrl(input.token),
    expiresAt: formatDateTime(input.expiresAt, input.inviter.organizationTimezone),
  })

  const sent = await sendEmail({ to: input.to, ...message }, 'invitation')
  return sent.ok ? 'sent' : 'failed'
}

/** Both parties, checklist 5.2 — the old owner's copy is also the alarm. */
export async function sendOwnershipEmails(input: {
  organizationName: string
  previousOwnerId: string
  newOwnerId: string
}): Promise<EmailOutcome> {
  if (!isEmailConfigured()) return 'off'

  const [previous, next] = await Promise.all([
    getNotificationTarget(input.previousOwnerId),
    getNotificationTarget(input.newOwnerId),
  ])

  const shared = {
    organizationName: input.organizationName,
    previousOwnerName: previous?.displayName ?? '',
    newOwnerName: next?.displayName || next?.email || '',
    url: appUrl('/settings?tab=organisasi'),
  }

  const results = await Promise.all(
    [
      previous && { to: previous.email, audience: 'previous' as const },
      next && { to: next.email, audience: 'new' as const },
    ]
      .filter((entry) => entry !== null && entry !== undefined)
      .map((entry) =>
        sendEmail(
          {
            to: entry.to,
            ...ownershipTransferredEmail({ ...shared, audience: entry.audience }),
          },
          'ownership_transferred',
        ),
      ),
  )

  return results.length === 2 && results.every((result) => result.ok) ? 'sent' : 'failed'
}

const FINISHED: readonly string[] = ['succeeded', 'partial', 'failed']

/**
 * Checklist 5.6: tell whoever started the job that it is done, unless they
 * switched that off. Runs after the job reached a terminal status; a job with
 * no recorded author (started before the column existed) has nobody to tell.
 */
export async function notifyAnalysisFinished(jobId: string): Promise<void> {
  if (!isEmailConfigured()) return

  try {
    const job = await getJobSnapshot(jobId)
    if (!job || !job.createdBy || !FINISHED.includes(job.status)) return

    const target = await getNotificationTarget(job.createdBy)
    if (!target?.notifyAnalysisFinished) return

    const status = job.status as FinishedStatus
    const message = analysisFinishedEmail({
      recipientName: target.displayName,
      organizationName: job.organizationName,
      datasetName: job.datasetName,
      status,
      analyzed: job.processedCount,
      total: job.totalCount,
      failed: job.failedCount,
      finishedAt: formatDateTime(
        job.finishedAt ?? new Date(),
        isOrgTimeZone(job.organizationTimezone) ? job.organizationTimezone : undefined,
      ),
      url: appUrl(status === 'failed' ? `/analysis/${jobId}` : `/reports/${jobId}`),
    })

    await sendEmail({ to: target.email, ...message }, 'analysis_finished')
  } catch (cause) {
    logger.warn('notifications.analysis_finished.failed', { jobId, cause: String(cause) })
  }
}

import { setJobsArchived } from '@/modules/analysis'
import { getNotificationTarget, getRetentionPolicies } from '@/modules/auth'
import {
  archiveDatasets,
  listRetentionDatasets,
  purgeArchivedDatasets,
  recordRetentionNotice,
  restoreDatasets,
  type RetentionDataset,
} from '@/modules/ingestion'
import {
  isEmailConfigured,
  retentionArchivedEmail,
  retentionNoticeEmail,
  sendEmail,
} from '@/modules/notifications'
import { logger, ok, type AppError, type Result } from '@/modules/shared'
import { clientEnv } from '@/lib/env'
import {
  RETENTION_STAGE,
  deletionDate,
  nextRetentionStep,
  retentionDeadline,
  type RetentionStep,
} from '@/lib/retention'
import { formatDate } from '@/lib/utils'
import { isOrgTimeZone } from '@/types/domain'

/**
 * The daily retention sweep (ADR-0012): warn, archive, delete — and restore,
 * when an account has moved to a plan that keeps data.
 *
 * It lives here because it is a composition no module may do alone: datasets
 * belong to ingestion, reports to analysis, the plan and the owner to auth,
 * and the email to notifications. What to do with a dataset on a given day is
 * decided by `nextRetentionStep`; this file only carries the decision out.
 *
 * One rule shapes everything below: a dataset moves a step forward only after
 * its owner was told. No email, no step. With email switched off the sweep
 * still restores — giving data back needs nobody's notice — and does nothing
 * else.
 */

export type SweepSummary = {
  emailConfigured: boolean
  noticed: number
  archived: number
  restored: number
  deleted: number
  /** Datasets that were due for a step the sweep could not take. */
  held: number
}

type Group = {
  stepKind: RetentionStep['kind']
  stage: number
  datasets: RetentionDataset[]
}

function settingsUrl(): string {
  return new URL('/settings?tab=data', clientEnv.NEXT_PUBLIC_APP_URL).toString()
}

export async function runRetentionSweep(
  now: Date = new Date(),
): Promise<Result<SweepSummary, AppError>> {
  const listed = await listRetentionDatasets()
  if (!listed.ok) return listed

  const policies = await getRetentionPolicies(
    listed.value.map((dataset) => dataset.organizationId),
  )
  const emailConfigured = isEmailConfigured()
  const summary: SweepSummary = {
    emailConfigured,
    noticed: 0,
    archived: 0,
    restored: 0,
    deleted: 0,
    held: 0,
  }

  // One email per workspace per kind of step, not one per dataset.
  const groups = new Map<string, Group>()
  for (const dataset of listed.value) {
    const policy = policies.get(dataset.organizationId)
    // No policy means the plan could not be read. Leave the data alone.
    if (!policy) continue

    const step = nextRetentionStep(dataset, policy.retentionDays, now)
    if (step.kind === 'none') continue

    const stage = step.kind === 'notify' ? step.stage : 0
    const key = `${dataset.organizationId}:${step.kind}:${stage}`
    const group = groups.get(key) ?? { stepKind: step.kind, stage, datasets: [] }
    group.datasets.push(dataset)
    groups.set(key, group)
  }

  for (const group of groups.values()) {
    const first = group.datasets[0]
    if (!first) continue
    const policy = policies.get(first.organizationId)
    if (!policy) continue
    const ids = group.datasets.map((dataset) => dataset.id)
    const count = group.datasets.length

    if (group.stepKind === 'restore') {
      // Datasets first: a half-done restore then shows a dataset without its
      // reports, which the next run repairs, rather than reports of nothing.
      if ((await restoreDatasets(ids)) && (await setJobsArchived(ids, null))) {
        summary.restored += count
      }
      continue
    }

    if (group.stepKind === 'delete') {
      summary.deleted += (await purgeArchivedDatasets(group.datasets)).length
      continue
    }

    // Every remaining step is "tell the owner", and needs someone to tell.
    const target = policy.ownerId ? await getNotificationTarget(policy.ownerId) : null
    if (!emailConfigured || !target) {
      summary.held += count
      continue
    }

    const timezone = isOrgTimeZone(policy.timezone) ? policy.timezone : undefined
    const shared = {
      recipientName: target.displayName,
      organizationName: policy.organizationName,
      datasets: group.datasets.map((dataset) => ({
        name: dataset.name,
        responseCount: dataset.responseCount,
      })),
      url: settingsUrl(),
    }

    if (group.stepKind === 'notify') {
      // The earliest deadline in the group: the date nothing here outlives.
      const deadline = retentionDeadline(first.clockAt, policy.retentionDays) ?? now
      const sent = await sendEmail(
        {
          to: target.email,
          ...retentionNoticeEmail({
            ...shared,
            final: group.stage === RETENTION_STAGE.finalNotice,
            archiveOn: formatDate(deadline > now ? deadline : now, timezone),
          }),
        },
        'retention_notice',
      )
      if (sent.ok && (await recordRetentionNotice(ids, group.stage, now))) {
        summary.noticed += count
      } else {
        summary.held += count
      }
      continue
    }

    // 'archive' hides first and announces after; 'announce-archive' is a run
    // whose announcement failed last time, trying again.
    if (group.stepKind === 'archive') {
      const hidden =
        (await setJobsArchived(ids, now)) && (await archiveDatasets(ids, now))
      if (!hidden) {
        summary.held += count
        continue
      }
      summary.archived += count
    }

    const archivedAt =
      group.stepKind === 'archive' ? now : new Date(first.archivedAt ?? now)
    const sent = await sendEmail(
      {
        to: target.email,
        ...retentionArchivedEmail({
          ...shared,
          // Counted from today: the 90 days start when the owner is told.
          deleteOn: formatDate(
            deletionDate((archivedAt > now ? archivedAt : now).toISOString()),
            timezone,
          ),
        }),
      },
      'retention_archived',
    )
    if (!sent.ok || !(await recordRetentionNotice(ids, RETENTION_STAGE.archived, now))) {
      summary.held += group.stepKind === 'archive' ? 0 : count
    }
  }

  logger.info('retention.sweep.finished', summary)
  return ok(summary)
}

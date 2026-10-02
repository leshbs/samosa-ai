/**
 * The retention arithmetic (ADR-0012, docs/workspace-plan.md), and nothing
 * else: no database, no email. The daily sweep and the pages that print
 * "Disimpan sampai …" both read these, so they cannot disagree.
 *
 *   clock ──(retentionDays)──▶ deadline ──▶ archived ──(90 days)──▶ deleted
 *                 ▲ 30 days and 7 days before: a notice
 *
 * A dataset only moves forward after its owner was actually told. A sweep
 * that cannot send email therefore archives and deletes nothing: deleting the
 * data of someone who never opens the app, without ever writing to them, is
 * not something this code is allowed to do.
 */

const DAY_MS = 24 * 60 * 60 * 1000

/** Days before the deadline at which the owner is written to. */
export const FIRST_NOTICE_DAYS = 30
export const FINAL_NOTICE_DAYS = 7
/** Days an archived dataset is kept, and can still be exported or restored. */
export const ARCHIVE_GRACE_DAYS = 90

export const RETENTION_STAGE = {
  none: 0,
  firstNotice: 1,
  finalNotice: 2,
  archived: 3,
} as const
export type RetentionStage = (typeof RETENTION_STAGE)[keyof typeof RETENTION_STAGE]

function addDays(iso: string | Date, days: number): Date {
  return new Date(new Date(iso).getTime() + days * DAY_MS)
}

/** When a live dataset is due to be archived; null on a plan that keeps data. */
export function retentionDeadline(
  clockAt: string,
  retentionDays: number | null,
): Date | null {
  return retentionDays === null ? null : addDays(clockAt, retentionDays)
}

/** The earliest an archived dataset can be deleted. */
export function deletionDate(archivedAt: string): Date {
  return addDays(archivedAt, ARCHIVE_GRACE_DAYS)
}

/** Whole days from `now` until `date`; 0 or less once it has passed. */
export function daysUntil(date: Date, now: Date = new Date()): number {
  return Math.ceil((date.getTime() - now.getTime()) / DAY_MS)
}

/** Whether the app should be warning about this dataset already. */
export function isNearDeadline(deadline: Date | null, now: Date = new Date()): boolean {
  return deadline !== null && daysUntil(deadline, now) <= FIRST_NOTICE_DAYS
}

export type RetentionState = {
  clockAt: string
  archivedAt: string | null
  stage: number
  notifiedAt: string | null
}

export type RetentionStep =
  /** Nothing to do today. */
  | { kind: 'none' }
  /** Write to the owner; record `stage` only if the email went out. */
  | { kind: 'notify'; stage: 1 | 2 }
  /** Hide the dataset, then tell the owner it happened. */
  | { kind: 'archive' }
  /** Already archived, but the owner was never told: tell them. */
  | { kind: 'announce-archive' }
  /** The plan keeps data now: bring it back. */
  | { kind: 'restore' }
  | { kind: 'delete' }

/**
 * What the sweep should do with one dataset today. One step per run, so a
 * sweep that was down for a month still gives every notice its own day rather
 * than warning, archiving and deleting in a single pass.
 */
export function nextRetentionStep(
  state: RetentionState,
  retentionDays: number | null,
  now: Date = new Date(),
): RetentionStep {
  const deadline = retentionDeadline(state.clockAt, retentionDays)

  if (state.archivedAt) {
    // An upgrade, or an override that pushed the deadline back out.
    if (deadline === null || deadline > now) return { kind: 'restore' }
    if (state.stage < RETENTION_STAGE.archived) return { kind: 'announce-archive' }
    // 90 days counted from when the owner was told, never from before.
    const told = state.notifiedAt ?? state.archivedAt
    const latest = new Date(told) > new Date(state.archivedAt) ? told : state.archivedAt
    return deletionDate(latest) <= now ? { kind: 'delete' } : { kind: 'none' }
  }

  if (deadline === null) return { kind: 'none' }
  const remaining = daysUntil(deadline, now)

  if (state.stage < RETENTION_STAGE.firstNotice) {
    return remaining <= FIRST_NOTICE_DAYS
      ? { kind: 'notify', stage: 1 }
      : { kind: 'none' }
  }
  if (state.stage < RETENTION_STAGE.finalNotice) {
    return remaining <= FINAL_NOTICE_DAYS
      ? { kind: 'notify', stage: 2 }
      : { kind: 'none' }
  }

  // Past the deadline, and the final notice is at least a week old: a notice
  // that went out late still buys its full seven days.
  const finalNoticeAt = state.notifiedAt ? new Date(state.notifiedAt) : null
  const noticeServed =
    finalNoticeAt !== null && addDays(finalNoticeAt, FINAL_NOTICE_DAYS) <= now
  return remaining <= 0 && noticeServed ? { kind: 'archive' } : { kind: 'none' }
}

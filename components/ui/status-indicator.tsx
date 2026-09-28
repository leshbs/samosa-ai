import { cn } from '@/lib/utils'
import type { JobStatus } from '@/types/domain'

/**
 * Ported from Watermelon UI's `status-indicator`, with three changes.
 *
 * Its states were `active | down | fixing | idle` painted with hardcoded
 * `bg-green-500` / `bg-red-500` / `bg-yellow-500`. The states here are the six
 * the database actually stores, in design_system.md's status colours (§9.4):
 * teal for done, Ember for running, amber for partial, rosella for failed.
 * Failed is rosella and not red on purpose — a failed batch is a fact about the
 * data, and the alarm red is reserved for destructive actions.
 *
 * Its ping also animated on three of four states. Here only `running` pulses,
 * because a pulse means "still moving" — a permanent pulse on a finished job is
 * decoration that costs a compositor layer.
 *
 * And it is a tinted pill rather than a bare dot, as §9.4 specifies, so the
 * state survives a glance from across the room. The dot is never the only
 * signal (§P8): the label ships with it, and callers that hide the label get
 * the text as sr-only instead.
 */
const LABELS: Record<JobStatus, string> = {
  queued: 'Menunggu',
  running: 'Berjalan',
  succeeded: 'Selesai',
  partial: 'Selesai sebagian',
  failed: 'Gagal',
  cancelled: 'Dibatalkan',
}

const TONE: Record<JobStatus, { dot: string; pill: string }> = {
  queued: {
    dot: 'bg-ink-400',
    pill: 'bg-secondary text-ink-600 dark:text-muted-foreground',
  },
  running: {
    dot: 'bg-ember-500',
    pill: 'bg-ember-50 text-ember-700 dark:bg-ember-900/40 dark:text-ember-200',
  },
  succeeded: {
    dot: 'bg-teal-500',
    pill: 'bg-teal-50 text-teal-700 dark:bg-teal-900/60 dark:text-teal-200',
  },
  partial: {
    dot: 'bg-attention',
    pill: 'bg-notice-surface text-notice',
  },
  failed: {
    dot: 'bg-negative',
    pill: 'bg-negative-surface text-negative-fg dark:text-[#efa3b5]',
  },
  cancelled: {
    dot: 'bg-ink-400',
    pill: 'bg-secondary text-ink-600 dark:text-muted-foreground',
  },
}

const SIZES = {
  sm: { dot: 'size-1.5', pill: 'gap-1.5 px-2 py-0.5 text-[12px]' },
  md: { dot: 'size-2', pill: 'gap-2 px-2.5 py-1 text-[13px]' },
  lg: { dot: 'size-2.5', pill: 'gap-2 px-3 py-1 text-sm' },
} as const

export function StatusIndicator({
  status,
  size = 'md',
  showLabel = true,
  className,
}: {
  status: JobStatus
  size?: keyof typeof SIZES
  showLabel?: boolean
  className?: string
}) {
  const tone = TONE[status]
  const dimensions = SIZES[size]

  const dot = (
    <span className="relative inline-flex shrink-0 items-center">
      {status === 'running' ? (
        <span
          className={cn(
            'absolute inline-flex animate-ping rounded-full opacity-60 motion-reduce:hidden',
            dimensions.dot,
            tone.dot,
          )}
        />
      ) : null}
      <span
        className={cn('relative inline-flex rounded-full', dimensions.dot, tone.dot)}
      />
    </span>
  )

  if (!showLabel) {
    return (
      <span className={cn('inline-flex items-center', className)}>
        {dot}
        <span className="sr-only">{LABELS[status]}</span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center whitespace-nowrap rounded-full font-semibold leading-none',
        dimensions.pill,
        tone.pill,
        className,
      )}
    >
      {dot}
      {LABELS[status]}
    </span>
  )
}

export { LABELS as JOB_STATUS_LABELS }

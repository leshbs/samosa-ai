import { Reveal } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'

/**
 * Eyebrow + display headline + one-sentence sub, the unit every landing
 * section opens with (design_system.md §4.3: every section has an eyebrow).
 *
 * The eyebrow is ember-700, not the spec's ember-600: -600 is 4.32:1 on the
 * sand-50 sections, under AA for 11px text. -700 passes on both backgrounds, so
 * one colour works everywhere. `onAlt` sets the sub to ink-600 for the same
 * reason — ink-500 is 4.48:1 on sand-50.
 */
export function SectionHeading({
  eyebrow,
  title,
  sub,
  align = 'center',
  onAlt = false,
  id,
}: {
  eyebrow: string
  title: React.ReactNode
  sub?: string
  align?: 'center' | 'start'
  onAlt?: boolean
  id?: string
}) {
  return (
    <Reveal
      className={cn(
        'space-y-4',
        align === 'center' ? 'mx-auto max-w-[720px] text-center' : 'max-w-spine',
      )}
    >
      <p className="eyebrow text-ember-700 dark:text-ember-400">{eyebrow}</p>
      <h2
        id={id}
        className="text-balance text-[32px] font-extrabold leading-[1.1] tracking-[-0.025em] sm:text-display-lg"
      >
        {title}
      </h2>
      {sub ? (
        <p
          className={cn(
            'text-pretty text-body-lg',
            onAlt ? 'text-ink-600 dark:text-muted-foreground' : 'text-muted-foreground',
          )}
        >
          {sub}
        </p>
      ) : null}
    </Reveal>
  )
}

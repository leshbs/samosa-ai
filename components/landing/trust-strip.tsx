import { FileSpreadsheet } from 'lucide-react'
import { EXPORT_SOURCES, TRUSTED_BY } from '@/components/landing/content'
import { Marquee } from '@/components/ui/marquee'

/** §11.2 · 04: a slow marquee only when there are more than six names. */
const MARQUEE_THRESHOLD = 6

/**
 * design_system.md §11.2 · 04. The spec's version is customer logos under
 * "DIPAKAI OLEH". Until an organization agrees to be named (`TRUSTED_BY` in
 * content.ts), the strip states something true instead: which tools' exports
 * SAMOSA reads.
 *
 * Names are text at 19px bold, which WCAG counts as large, so ink-500 (4.48:1
 * on sand-50) passes the 3:1 bar. The spec's "opacity 0.55" was written for
 * logos, which are exempt from contrast; text is not.
 */
export function TrustStrip() {
  const named = TRUSTED_BY.length > 0
  const items: readonly string[] = named ? TRUSTED_BY : EXPORT_SOURCES

  const row = items.map((name) => (
    <span
      key={name}
      className="flex shrink-0 items-center gap-2 text-[19px] font-bold tracking-[-0.01em] text-ink-500 dark:text-muted-foreground"
    >
      {named ? null : <FileSpreadsheet aria-hidden className="size-4 text-ink-400" />}
      {name}
    </span>
  ))

  return (
    <section aria-labelledby="trust-title" className="bg-alt py-12">
      <div className="mx-auto max-w-landing space-y-6 px-6 lg:px-10">
        <p
          id="trust-title"
          className="eyebrow text-center text-ember-700 dark:text-ember-400"
        >
          {named ? 'Dipakai oleh' : 'Bekerja dengan ekspor CSV & Excel dari'}
        </p>
        {items.length > MARQUEE_THRESHOLD ? (
          <Marquee>{row}</Marquee>
        ) : (
          <div className="flex flex-wrap items-center justify-center gap-x-12 gap-y-4">
            {row}
          </div>
        )}
      </div>
    </section>
  )
}

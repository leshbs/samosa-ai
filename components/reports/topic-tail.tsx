import type { TopicCount } from '@/modules/reporting'
import { formatPercent } from '@/lib/utils'

/**
 * The topics that did not make the chart, behind a disclosure.
 *
 * Uses `<details>` rather than React state so it costs no JavaScript and works
 * before hydration — this sits under a chart that is already the heaviest thing
 * on the page.
 *
 * It exists because the tail is evidence, not clutter. `analysis.v1` normalizes
 * topics by lowercasing alone, so a long tail is ambiguous between "students
 * raised many different things" and "the model spelled one thing six ways",
 * and only the list itself tells you which. Collapsing it into a bucket without
 * offering the list would hide the one view that answers that.
 */
export function TopicTail({
  topics,
  noun = 'topik',
}: {
  topics: TopicCount[]
  /** What the listed terms are: topics, or the choices of a "pilihan" question. */
  noun?: 'topik' | 'pilihan'
}) {
  if (topics.length === 0) return null

  return (
    <details className="group rounded-md border bg-card">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium marker:content-none">
        <span className="text-muted-foreground group-open:hidden">
          Lihat {topics.length} {noun} lain di kelompok “Lainnya”
        </span>
        <span className="hidden text-muted-foreground group-open:inline">
          Sembunyikan {topics.length} {noun} lain
        </span>
      </summary>

      <div className="border-t px-4 py-3">
        <ul className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {topics.map((topic) => (
            <li key={topic.term} className="flex items-baseline justify-between gap-2">
              <span className="truncate" title={topic.term}>
                {topic.term}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {topic.count} · {formatPercent(topic.share)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

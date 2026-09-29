import { formatDateTime } from '@/lib/utils'
import type { OrgTimeZone } from '@/types/domain'

/**
 * §6.8, the last section on the page. The Golden Rule is a report someone can
 * defend in a meeting, and the question that ends that meeting badly is "where
 * did this come from?" — so the answer is printed on the artefact: which model,
 * which prompt version, when, over how many responses, at what cost.
 *
 * The prompt version is the load-bearing one. Prompts are versioned and never
 * edited in place, so `analysis.v1` here means the exact instructions that
 * produced these numbers can still be read back months later.
 */
export function ProvenanceStrip({
  modelId,
  promptVersion,
  summaryGeneratedAt,
  analyzedAt,
  analyzed,
  cost,
  datasetName,
  runBy = null,
  timeZone,
}: {
  modelId: string
  promptVersion: string
  summaryGeneratedAt: string | null
  analyzedAt: string
  analyzed: number
  /** Already formatted on the server; pricing tables stay off the client. */
  cost: string | null
  datasetName: string
  /** "Rani Putri · Sekretaris OSIS 2026/2027"; null for jobs from before it was recorded. */
  runBy?: string | null
  timeZone?: OrgTimeZone
}) {
  const facts: Array<{ label: string; value: string }> = [
    { label: 'Dataset', value: datasetName },
    { label: 'Aspirasi dianalisis', value: String(analyzed) },
    { label: 'Model', value: modelId || 'tidak tercatat' },
    { label: 'Versi prompt', value: promptVersion },
    { label: 'Dianalisis', value: formatDateTime(analyzedAt, timeZone) },
    ...(runBy ? [{ label: 'Dijalankan oleh', value: runBy }] : []),
    ...(summaryGeneratedAt
      ? [
          {
            label: 'Ringkasan disusun',
            value: formatDateTime(summaryGeneratedAt, timeZone),
          },
        ]
      : []),
    ...(cost ? [{ label: 'Perkiraan biaya', value: cost }] : []),
  ]

  return (
    <section
      aria-labelledby="provenance-heading"
      data-print="keep-together"
      className="rounded-card border bg-muted/40 px-4 py-4"
    >
      <h2
        id="provenance-heading"
        className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
      >
        Asal data
      </h2>
      <dl className="mt-3 grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2 lg:grid-cols-3">
        {facts.map((fact) => (
          <div key={fact.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-muted-foreground">{fact.label}</dt>
            <dd className="truncate text-right font-medium" title={fact.value}>
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Sentimen, topik, dan kata kunci dihasilkan model bahasa dan bisa salah. Setiap
        angka di laporan ini bisa dilacak ke aspirasi aslinya di tabel di atas.
      </p>
    </section>
  )
}

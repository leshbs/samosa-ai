import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RegenerateSummaryButton } from '@/components/reports/regenerate-summary-button'
import { formatDateTime } from '@/lib/utils'
import type { OrgTimeZone } from '@/types/domain'

export type ExecutiveSummaryProps = {
  jobId: string
  summary: string | null
  generatedAt: string | null
  /** §5: hidden entirely for a role that cannot spend the organization's budget. */
  canRegenerate: boolean
  timeZone?: OrgTimeZone
  /**
   * More than one when the report has several questions. The narrative is
   * still written from all of them pooled (the per-question summary comes with
   * analysis modes), and a reader should not have to guess that.
   */
  questionCount?: number
}

/**
 * §6.3 — the narrative, and only the narrative. The insights that used to live
 * inside this card are now their own section (§6.4), because they are a
 * different kind of claim: the summary describes the dataset, an insight argues
 * something about it and has to carry evidence.
 *
 * The prose is capped at the narrative spine (680px) even though the card is
 * wider, because a 1100px line of Indonesian prose is measurably harder to
 * track back to the start of the next line.
 */
export function ExecutiveSummary({
  jobId,
  summary,
  generatedAt,
  canRegenerate,
  timeZone,
  questionCount = 1,
}: ExecutiveSummaryProps) {
  return (
    <Card data-print="keep-together">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Ringkasan eksekutif</CardTitle>
          <p className="text-xs text-muted-foreground">
            {generatedAt
              ? `Disusun AI · ${formatDateTime(generatedAt, timeZone)}`
              : 'Belum ada ringkasan untuk laporan ini.'}
          </p>
        </div>
        {canRegenerate ? (
          <span data-print="hide">
            <RegenerateSummaryButton jobId={jobId} hasSummary={Boolean(summary)} />
          </span>
        ) : null}
      </CardHeader>

      <CardContent>
        {summary ? (
          <div className="max-w-narrative space-y-3">
            <p className="text-sm leading-relaxed">{summary}</p>
            {questionCount > 1 ? (
              <p className="text-xs text-muted-foreground">
                Ringkasan ini disusun dari gabungan {questionCount} pertanyaan. Angka dan
                topik per pertanyaan ada di bagian masing-masing di bawah.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="max-w-narrative text-sm text-muted-foreground">
            Grafik dan tabel di bawah tetap lengkap tanpa ringkasan. Tekan tombol di atas
            untuk menyusunnya dari hasil analisis yang sudah ada.
          </p>
        )}
      </CardContent>
    </Card>
  )
}

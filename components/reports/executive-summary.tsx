import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { RegenerateSummaryButton } from '@/components/reports/regenerate-summary-button'
import { formatDateTime } from '@/lib/utils'
import type { ReportInsight } from '@/types/domain'

export type ExecutiveSummaryProps = {
  jobId: string
  summary: string | null
  insights: ReportInsight[]
  generatedAt: string | null
  /** responseId -> the aspiration text, so an insight can show its evidence. */
  quotesById: Map<string, string>
}

export function ExecutiveSummary({
  jobId,
  summary,
  insights,
  generatedAt,
  quotesById,
}: ExecutiveSummaryProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div className="space-y-1">
          <CardTitle className="text-base">Ringkasan eksekutif</CardTitle>
          <p className="text-xs text-muted-foreground">
            {generatedAt
              ? `Disusun AI · ${formatDateTime(generatedAt)}`
              : 'Belum ada ringkasan untuk laporan ini.'}
          </p>
        </div>
        <RegenerateSummaryButton jobId={jobId} hasSummary={Boolean(summary)} />
      </CardHeader>

      <CardContent className="space-y-6">
        {summary ? (
          <p className="text-sm leading-relaxed">{summary}</p>
        ) : (
          <p className="text-sm text-muted-foreground">
            Grafik dan tabel di bawah tetap lengkap tanpa ringkasan. Tekan tombol di atas
            untuk menyusunnya dari hasil analisis yang sudah ada.
          </p>
        )}

        {insights.length > 0 && (
          <ul className="space-y-4">
            {insights.map((insight) => {
              // Only ids that still resolve to a response are shown; an insight
              // whose evidence was deleted loses the quote, not the insight.
              const evidence = insight.evidenceResponseIds
                .map((id) => quotesById.get(id))
                .filter((text): text is string => Boolean(text))

              return (
                <li key={insight.title} className="space-y-2">
                  <p className="text-sm font-medium">{insight.title}</p>
                  <p className="text-sm text-muted-foreground">{insight.detail}</p>
                  {evidence.map((text) => (
                    <blockquote
                      key={text}
                      className="border-l-2 pl-3 text-xs italic text-muted-foreground"
                    >
                      {text}
                    </blockquote>
                  ))}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

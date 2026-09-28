import { Download, FileText } from 'lucide-react'
import { LogoMark } from '@/components/brand/logo'

const SENTIMENT = [
  { label: 'Positif', share: 61, bar: 'bg-positive' },
  { label: 'Netral', share: 24, bar: 'bg-attention' },
  { label: 'Negatif', share: 15, bar: 'bg-negative' },
] as const

const TOPICS = [
  { label: 'Antrean masuk', count: 84 },
  { label: 'Lineup band', count: 71 },
  { label: 'Kebersihan area', count: 46 },
  { label: 'Harga tiket', count: 29 },
] as const

const TOPIC_MAX = 84

/**
 * A static rendering of the report page for the landing screenshot
 * (design_system.md §11.2 · 03: "the full report page with insights and
 * charts, not an empty screen"). Built from markup rather than an image: it is
 * sharper at every density, follows the theme, and weighs less than a PNG.
 *
 * Bars are solid fills starting at zero, with their numbers written beside
 * them — the same rules as the real charts, because a screenshot that breaks
 * them would be advertising the opposite of what the product does.
 */
export function ReportPreview() {
  return (
    <div className="grid text-left md:grid-cols-[180px_1fr]" aria-hidden>
      <div className="hidden flex-col gap-2 bg-ink-950 bg-grad-sidebar p-4 md:flex">
        <LogoMark className="mb-4 size-7" />
        {['w-20', 'w-16', 'w-24', 'w-14'].map((width, index) => (
          <span
            key={width}
            className={`h-7 rounded-md px-2.5 py-2 ${index === 2 ? 'bg-white/10' : ''}`}
          >
            <span className={`block h-2 rounded-full bg-white/25 ${width}`} />
          </span>
        ))}
      </div>

      <div className="min-w-0 space-y-5 bg-background p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="font-mono text-micro text-muted-foreground">
              Laporan / Evaluasi Acara 2026
            </p>
            <p className="text-h3">Evaluasi Acara 2026</p>
          </div>
          <div className="flex gap-2">
            <span className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-[12px] font-semibold">
              <FileText className="size-3.5" /> Ekspor PDF
            </span>
            <span className="hidden h-8 items-center gap-1.5 rounded-md border bg-card px-2.5 text-[12px] font-semibold sm:inline-flex">
              <Download className="size-3.5" /> Ekspor CSV
            </span>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {[
            ['310', 'aspirasi'],
            ['61%', 'positif'],
            ['84', 'soal antrean'],
          ].map(([value, label]) => (
            <div key={label} className="rounded-lg border bg-card p-3">
              <p className="text-[22px] font-bold leading-none tracking-tight">{value}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">{label}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-2.5 rounded-lg border bg-card p-4">
            <p className="eyebrow text-muted-foreground">Insight 1</p>
            <p className="text-[15px] font-bold leading-snug">
              Antrean masuk jadi keluhan terbesar
            </p>
            <p className="text-[12.5px] leading-relaxed text-muted-foreground">
              84 aspirasi menyebut antrean di gerbang; sebagian besar dari sesi sore.
            </p>
            <p className="rounded-md bg-alt px-3 py-2.5 text-[12px] leading-relaxed">
              “Antre di gerbang hampir satu jam, padahal band pembukanya sudah main.”
              <span className="mt-1 block font-mono text-[10.5px] text-muted-foreground">
                R-0142 · Negatif
              </span>
            </p>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {['R-0142', 'R-0187', 'R-0203', '+81'].map((id) => (
                <span
                  key={id}
                  className="rounded-sm bg-ember-100 px-1.5 py-0.5 font-mono text-[11px] text-ember-700 dark:bg-ember-900/40 dark:text-ember-200"
                >
                  {id}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border bg-card p-4">
            <div className="space-y-2">
              <p className="eyebrow text-muted-foreground">Sentimen</p>
              {SENTIMENT.map(({ label, share, bar }, index) => (
                <div key={label} className="flex items-center gap-2 text-[12px]">
                  <span className="w-14 shrink-0 text-muted-foreground">{label}</span>
                  <span className="h-2 flex-1 rounded-full bg-secondary">
                    <span
                      className={`block h-full origin-left animate-grow-x rounded-full ${bar}`}
                      style={{
                        width: `${share}%`,
                        animationDelay: `${700 + index * 90}ms`,
                      }}
                    />
                  </span>
                  <span className="w-8 text-right font-mono">{share}%</span>
                </div>
              ))}
            </div>
            <div className="space-y-2">
              <p className="eyebrow text-muted-foreground">Topik teratas</p>
              {TOPICS.map(({ label, count }, index) => (
                <div key={label} className="flex items-center gap-2 text-[12px]">
                  <span className="w-24 shrink-0 truncate text-muted-foreground">
                    {label}
                  </span>
                  <span className="h-2 flex-1">
                    <span
                      className="block h-full origin-left animate-grow-x rounded-r-sm bg-teal-500"
                      style={{
                        width: `${(count / TOPIC_MAX) * 100}%`,
                        animationDelay: `${980 + index * 70}ms`,
                      }}
                    />
                  </span>
                  <span className="w-6 text-right font-mono">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

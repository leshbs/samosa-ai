import { AlertCircle, Check, FileText, Hash, Sheet, Tags } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * The three feature visuals (design_system.md §11.2 · 06): slices of the real
 * interface rendered from markup, not illustrations. Decorative to assistive
 * technology — the feature text beside each one already says what it shows.
 */

const PANEL = 'rounded-card border bg-card p-6 shadow-sm'

export function InsightVisual() {
  return (
    <div aria-hidden className={PANEL}>
      <p className="eyebrow text-muted-foreground">Insight 2</p>
      <p className="mt-2 text-h4 font-bold">Toilet lantai 2 paling sering dikeluhkan</p>
      <p className="mt-1.5 text-body-sm text-muted-foreground">
        47 aspirasi menyebut air mati atau pintu rusak, hampir semuanya dari kelas XI.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="text-[12px] font-semibold text-muted-foreground">Bukti</span>
        {['R-0142', 'R-0187', 'R-0203'].map((id, index) => (
          <span
            key={id}
            className={cn(
              'rounded-sm px-1.5 py-0.5 font-mono text-[11px]',
              index === 0
                ? 'bg-ember-600 text-white'
                : 'bg-ember-100 text-ember-700 dark:bg-ember-900/40 dark:text-ember-200',
            )}
          >
            {id}
          </span>
        ))}
        <span className="font-mono text-[11px] text-muted-foreground">+44</span>
      </div>
      <blockquote className="mt-4 rounded-lg bg-alt p-4">
        <p className="text-body-sm">
          “Toilet lantai 2 sering nggak ada air, jadi harus turun ke lantai 1 pas
          istirahat.”
        </p>
        <footer className="mt-2 font-mono text-[11px] text-muted-foreground">
          R-0142 · Negatif · Fasilitas
        </footer>
      </blockquote>
    </div>
  )
}

const CONDITIONS = [
  {
    icon: Check,
    text: '298 dari 310 aspirasi dianalisis',
    tone: 'text-teal-700 dark:text-teal-300',
  },
  {
    icon: AlertCircle,
    text: '12 gagal dianalisis — dihitung terpisah, tidak dibuang',
    tone: 'text-notice',
  },
  { icon: Tags, text: '18 aspirasi tanpa topik', tone: 'text-muted-foreground' },
  {
    icon: Hash,
    text: 'Prompt analysis.v1 · model tercatat per baris',
    tone: 'text-muted-foreground',
  },
] as const

export function ConditionVisual() {
  return (
    <div aria-hidden className={PANEL}>
      <p className="eyebrow text-muted-foreground">Kondisi data</p>
      <ul className="mt-4 divide-y">
        {CONDITIONS.map(({ icon: Icon, text, tone }) => (
          <li key={text} className="flex items-center gap-3 py-3 text-body-sm">
            <Icon className={cn('size-4 shrink-0', tone)} />
            <span className={text.includes('Prompt') ? 'font-mono text-[12.5px]' : ''}>
              {text}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-secondary">
        <span className="bg-teal-500" style={{ width: '96%' }} />
        <span className="bg-attention" style={{ width: '4%' }} />
      </div>
    </div>
  )
}

export function ExportVisual() {
  return (
    <div aria-hidden className={cn(PANEL, 'shadow-md')}>
      <p className="text-h4 font-bold">Ekspor laporan</p>
      <p className="mt-1 text-body-sm text-muted-foreground">Evaluasi Pensi 2026</p>
      <div className="mt-5 space-y-2.5">
        {[
          {
            icon: FileText,
            title: 'PDF',
            detail: 'Berhalaman, siap cetak, setiap grafik dengan tabelnya',
            selected: true,
          },
          {
            icon: Sheet,
            title: 'CSV',
            detail: 'Setiap aspirasi dengan sentimen, topik, dan kata kunci',
            selected: false,
          },
        ].map(({ icon: Icon, title, detail, selected }) => (
          <div
            key={title}
            className={cn(
              'flex items-start gap-3 rounded-lg border p-3.5',
              selected && 'border-ember-500 bg-ember-50 dark:bg-ember-900/20',
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border-2',
                selected ? 'border-ember-600' : 'border-ink-300',
              )}
            >
              {selected ? <span className="size-1.5 rounded-full bg-ember-600" /> : null}
            </span>
            <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span>
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block text-body-sm text-muted-foreground">{detail}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <span className="inline-flex h-[34px] items-center rounded-md px-3 text-[13px] font-semibold text-muted-foreground">
          Batal
        </span>
        <span className="inline-flex h-[34px] items-center rounded-md bg-ink-900 px-3 text-[13px] font-semibold text-sand-25 dark:bg-sand-25 dark:text-ink-900">
          Unduh PDF
        </span>
      </div>
    </div>
  )
}

import { AlertTriangle, CircleSlash, Info, MessageSquareOff } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

/**
 * §6.2 and §P2. What this dataset does *not* tell you, stated before the charts
 * rather than in a footnote under them.
 *
 * Four numbers matter and all four are routinely hidden by report tools:
 * responses the model could not analyse at all, responses it analysed but gave
 * no topic (so they are missing from the topic chart even though they are in the
 * sentiment chart), respondents who wrote "tidak ada" (pilot 01: counted as
 * neutral, they made every percentage lie), and whether the job finished
 * completely.
 *
 * Styled as information, not alarm (§P2). A red banner on a job where 12 of 340
 * rows failed reads as "this report is broken"; the truth is "this report covers
 * 328 responses", which is a sentence, not a warning.
 */
export function DataConditionStrip({
  analyzed,
  failed,
  untagged,
  noContent,
  isPartial,
  className,
}: {
  analyzed: number
  failed: number
  untagged: number
  /** Null when the job predates the count (analysis.v1): unknown, not zero. */
  noContent: number | null
  isPartial: boolean
  className?: string
}) {
  const hasCaveat = failed > 0 || untagged > 0 || isPartial

  return (
    <section
      aria-label="Kondisi data"
      data-print="keep-together"
      className={cn(
        'rounded-card border bg-card',
        hasCaveat && 'border-notice/40 bg-notice-surface',
        className,
      )}
    >
      <dl className="flex flex-wrap items-stretch divide-y divide-border sm:divide-y-0 [&>div]:min-w-[12rem] [&>div]:flex-1">
        <Row
          icon={<Info aria-hidden className="text-muted-foreground" />}
          label="Dianalisis"
          value={`${analyzed} aspirasi`}
          detail="Punya sentimen dan masuk ke seluruh grafik."
        />

        <Row
          icon={<MessageSquareOff aria-hidden className="text-muted-foreground" />}
          label="Tanpa aspirasi"
          value={
            noContent === null
              ? 'Tidak dihitung'
              : noContent === 0
                ? 'Tidak ada'
                : `${noContent} jawaban`
          }
          detail={
            noContent === null
              ? 'Analisis ini dijalankan sebelum jawaban seperti “tidak ada” dipisahkan. Jalankan ulang untuk memisahkannya.'
              : 'Jawaban seperti “tidak ada” atau “-”. Tidak dihitung di persentase mana pun.'
          }
        />

        <Row
          icon={
            <CircleSlash
              aria-hidden
              className={untagged > 0 ? 'text-notice' : 'text-muted-foreground'}
            />
          }
          label="Tanpa topik"
          value={untagged === 0 ? 'Tidak ada' : `${untagged} aspirasi`}
          detail={
            untagged === 0
              ? 'Semua aspirasi mendapat setidaknya satu topik.'
              : 'Terhitung di grafik sentimen, tidak di grafik topik.'
          }
        />

        <Row
          icon={
            <AlertTriangle
              aria-hidden
              className={failed > 0 ? 'text-notice' : 'text-muted-foreground'}
            />
          }
          label="Gagal dianalisis"
          value={failed === 0 ? 'Tidak ada' : `${failed} aspirasi`}
          detail={
            failed === 0
              ? 'Tidak ada batch yang gagal.'
              : 'Tidak terhitung di angka mana pun di laporan ini.'
          }
        />
      </dl>

      {isPartial ? (
        <p className="flex flex-wrap items-center gap-2 border-t px-4 py-3 text-sm">
          <Badge variant="notice">Selesai sebagian</Badge>
          <span className="text-muted-foreground">
            Sebagian batch gagal dan hasil yang berhasil tetap disimpan. Angka di bawah
            menggambarkan {analyzed} aspirasi, bukan seluruh dataset.
          </span>
        </p>
      ) : null}
    </section>
  )
}

function Row({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="space-y-1 px-4 py-3">
      <dt className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
        <span className="[&>svg]:size-3.5">{icon}</span>
        {label}
      </dt>
      <dd className="space-y-0.5">
        <p className="text-sm font-medium">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </dd>
    </div>
  )
}

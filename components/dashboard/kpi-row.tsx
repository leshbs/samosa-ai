import { KpiCard } from '@/components/dashboard/kpi-card'
import { KpiNumber } from '@/components/dashboard/kpi-number'
import { Sparkline } from '@/components/dashboard/sparkline'
import { Stagger, StaggerItem } from '@/components/motion/primitives'
import { formatIdr } from '@/modules/analysis'
import type { HomeSummary } from '@/modules/reporting'

const NUMBER = new Intl.NumberFormat('id-ID')
const formatNumber = (value: number) => NUMBER.format(Math.round(value))

/** §10.3: shown once there is at least one report to count. */
export function KpiRow({ summary }: { summary: HomeSummary }) {
  return (
    <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" step={0.06}>
      <StaggerItem>
        <KpiCard
          tone="teal"
          label="Aspirasi dianalisis"
          value={<KpiNumber value={summary.analyzedTotal} kind="count" />}
          detail={
            summary.analyzedThisMonth > 0
              ? `+${formatNumber(summary.analyzedThisMonth)} bulan ini`
              : 'Belum ada bulan ini'
          }
        />
      </StaggerItem>
      <StaggerItem>
        <KpiCard
          tone="ember"
          label="Laporan dibuat"
          value={<KpiNumber value={summary.reportCount} kind="count" />}
          detail={
            summary.runningCount > 0
              ? `${summary.runningCount} lagi sedang berjalan`
              : 'Siap dibaca dan diekspor'
          }
        />
      </StaggerItem>
      <StaggerItem>
        <KpiCard
          tone="teal"
          label="Rata-rata sentimen positif"
          value={
            summary.positiveAverage === null ? (
              '—'
            ) : (
              <KpiNumber value={summary.positiveAverage} kind="share" />
            )
          }
          detail={
            summary.positiveAverage === null
              ? 'Belum bisa dihitung'
              : `Dari ${summary.positiveTrend.length} laporan terakhir`
          }
          aside={<Sparkline values={summary.positiveTrend} />}
        />
      </StaggerItem>
      <StaggerItem>
        <KpiCard
          label="Estimasi biaya bulan ini"
          value={
            <span className="font-mono text-[28px] font-medium tracking-tight">
              {formatIdr(summary.costThisMonthMicroIdr)}
            </span>
          }
          detail="Perkiraan dari pemakaian token"
        />
      </StaggerItem>
    </Stagger>
  )
}

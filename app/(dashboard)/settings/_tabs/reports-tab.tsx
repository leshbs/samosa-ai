import { SettingValue, SwitchSetting } from '@/components/settings/switch-setting'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { can, getOrganizationSettings, type SessionUser } from '@/modules/auth'
import {
  DEFAULT_REPORT_PREFERENCES,
  ROLE_LABELS,
  type ReportPreferences,
} from '@/types/domain'

const OPTIONS: Array<{
  key: keyof ReportPreferences
  field: string
  label: string
  description: string
}> = [
  {
    key: 'includeQuotes',
    field: 'reportIncludeQuotes',
    label: 'Kutipan aspirasi',
    description:
      'Contoh aspirasi per topik, apa adanya. Matikan kalau laporan dibagikan ke luar pengurus.',
  },
  {
    key: 'includeTopicTail',
    field: 'reportIncludeTopicTail',
    label: 'Semua topik',
    description:
      'Daftar topik di luar sepuluh besar beserta jumlahnya. Laporan jadi lebih panjang.',
  },
  {
    key: 'includeProvenance',
    field: 'reportIncludeProvenance',
    label: 'Keterangan asal data',
    description:
      'Model, versi prompt, waktu analisis, dan siapa yang menjalankannya — di akhir laporan.',
  },
]

/**
 * Checklist 5.5. Set once for the organization and applied to every PDF
 * afterwards, by anyone: the export button itself stays a single click.
 */
export async function ReportsTab({ session }: { session: SessionUser }) {
  const canManage = can(session.role, 'org:manage')
  const settings = await getOrganizationSettings(session.organizationId)
  const preferences = settings.ok
    ? settings.value.reportPreferences
    : DEFAULT_REPORT_PREFERENCES

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Isi laporan PDF</CardTitle>
        <CardDescription>
          Berlaku untuk setiap unduhan PDF berikutnya, oleh siapa pun di organisasi ini.
          Grafik, ringkasan, dan tabel sentimen selalu ada.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="divide-y">
          {OPTIONS.map((option) =>
            canManage ? (
              <SwitchSetting
                key={option.key}
                id={`report-${option.key}`}
                label={option.label}
                description={option.description}
                endpoint="/api/settings/organization"
                field={option.field}
                initialChecked={preferences[option.key]}
                savedOn={`${option.label} dimasukkan ke PDF berikutnya.`}
                savedOff={`${option.label} tidak lagi dimasukkan ke PDF.`}
              />
            ) : (
              <SettingValue
                key={option.key}
                label={option.label}
                description={option.description}
                value={preferences[option.key] ? 'Disertakan' : 'Tidak disertakan'}
              />
            ),
          )}
        </div>
        {!canManage ? (
          <p className="pt-2 text-xs text-muted-foreground">
            Hanya pemilik yang bisa mengubah ini. Peranmu: {ROLE_LABELS[session.role]}.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

import { SwitchSetting } from '@/components/settings/switch-setting'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { getProfileDetails, type SessionUser } from '@/modules/auth'
import { isEmailConfigured } from '@/modules/notifications'

/**
 * Checklist 5.6: one switch, on by default, no per-event matrix. It belongs to
 * the person, not the organization — each member decides for themselves — so
 * it is stored on the profile, even though it lives in the settings tabs.
 */
export async function NotificationsTab({ session }: { session: SessionUser }) {
  const profile = await getProfileDetails()
  const emailOn = isEmailConfigured()
  const enabled = profile.ok ? profile.value.notifyAnalysisFinished : true

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Notifikasi</CardTitle>
        <CardDescription>
          Pengaturan ini milikmu sendiri; anggota lain mengatur miliknya masing-masing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <SwitchSetting
          id="notify-analysis-finished"
          label="Email saat analisis selesai"
          description={`Untuk analisis yang kamu jalankan: nama dataset, jumlah aspirasi, status, dan satu tombol ke laporannya. Dikirim ke ${session.email}.`}
          endpoint="/api/settings/profile"
          field="notifyAnalysisFinished"
          initialChecked={enabled}
          savedOn="Kamu akan menerima email saat analisis selesai."
          savedOff="Email analisis selesai dimatikan."
        />
        {!emailOn ? (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Server ini belum bisa mengirim email — domain pengirimnya belum disiapkan.
            Pilihanmu tetap disimpan dan langsung berlaku begitu email aktif. Sampai saat
            itu, analisis tetap tersimpan walau tab ditutup; buka lagi dari menu Analisis.
          </p>
        ) : null}
      </CardContent>
    </Card>
  )
}

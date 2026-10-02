import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/layout/page-header'
import { ProfileForm } from '@/components/profile/profile-form'
import { SignInMethods } from '@/components/profile/sign-in-methods'
import { SignOutEverywhere } from '@/components/profile/sign-out-everywhere'
import { ImageUploadField } from '@/components/settings/image-upload-field'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { listJobs } from '@/modules/analysis'
import { getProfileDetails, getSessionUser } from '@/modules/auth'
import { formatDateTime } from '@/lib/utils'
import { ROLE_LABELS, isReportable, type JobStatus } from '@/types/domain'

export const metadata: Metadata = { title: 'Profil' }

/** "My recent activity" (checklist 5.8): enough to find last week's run. */
const RECENT_ACTIVITY = 10

const STATUS_LABELS: Record<JobStatus, string> = {
  queued: 'antre',
  running: 'berjalan',
  succeeded: 'selesai',
  partial: 'selesai sebagian',
  failed: 'gagal',
  cancelled: 'dibatalkan',
}

/**
 * Checklist 5.8, and deliberately thin: who you are, how you sign in, where
 * you are signed in, what you ran. No bio, no social links, no public page —
 * this is a tool account, not a profile anyone browses.
 */
export default async function ProfilePage() {
  const session = await getSessionUser()
  if (!session.ok) redirect('/login')

  const [profile, activity] = await Promise.all([
    getProfileDetails(),
    listJobs(session.value.organizationId, {
      createdBy: session.value.userId,
      limit: RECENT_ACTIVITY,
    }),
  ])
  if (!profile.ok) redirect('/login')

  const me = profile.value
  const timezone = session.value.organizationTimezone

  return (
    <section className="mx-auto max-w-narrative space-y-6">
      <PageHeader
        title="Profil"
        description={`${ROLE_LABELS[session.value.role]} di ${session.value.organizationName}.`}
        crumbs={[{ label: 'Profil' }]}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tentang kamu</CardTitle>
          <CardDescription>
            Terlihat oleh anggota {session.value.organizationName}, dan tercetak di
            laporan yang kamu siapkan.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <ImageUploadField
            label="Foto"
            endpoint="/api/settings/profile/avatar"
            initialUrl={me.avatarUrl}
            fallbackName={me.displayName || me.email}
            shape="circle"
            savedMessage="Foto tersimpan."
            removedMessage="Foto dihapus. Inisial namamu dipakai sebagai gantinya."
          />
          <ProfileForm initialName={me.displayName} initialTitle={me.title} />
          <div className="flex justify-between gap-4 border-t pt-4 text-sm">
            <span className="text-muted-foreground">Email</span>
            <span className="truncate font-medium">{me.email}</span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cara masuk</CardTitle>
          <CardDescription>
            Tautkan keduanya supaya tetap bisa masuk kalau salah satu bermasalah.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignInMethods
            email={me.email}
            hasPassword={me.hasPassword}
            googleEmail={me.googleEmail}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sesi</CardTitle>
          <CardDescription>
            Lupa keluar di komputer lab atau di HP teman? Keluarkan semuanya dari sini.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SignOutEverywhere />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Aktivitas terakhir</CardTitle>
          <CardDescription>Analisis yang kamu jalankan, terbaru di atas.</CardDescription>
        </CardHeader>
        <CardContent>
          {!activity.ok ? (
            <p className="text-sm text-muted-foreground">{activity.error.message}.</p>
          ) : activity.value.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Belum ada analisis yang kamu jalankan.{' '}
              <Link
                href="/datasets"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Pilih dataset
              </Link>{' '}
              untuk mulai.
            </p>
          ) : (
            <ul className="divide-y">
              {activity.value.map((job) => (
                <li key={job.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <Link
                      href={
                        isReportable(job.status)
                          ? `/reports/${job.id}`
                          : `/analysis/${job.id}`
                      }
                      className="block truncate text-sm font-medium underline-offset-4 hover:underline"
                    >
                      {job.datasetName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {formatDateTime(job.createdAt, timezone)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {job.processedCount.toLocaleString('id-ID')} aspirasi ·{' '}
                    {STATUS_LABELS[job.status]}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  )
}

import type { Metadata } from 'next'
import Link from 'next/link'
import { AcceptInvitationButton } from '@/components/forms/accept-invitation-button'
import { SignOutButton } from '@/components/forms/sign-out-button'
import { Button } from '@/components/ui/button'
import { getAuthUser, getInvitationPreview, type InvitationStatus } from '@/modules/auth'
import { acceptInvitationSchema } from '@/types/api'
import { ROLE_DESCRIPTIONS, ROLE_LABELS } from '@/types/domain'

export const metadata: Metadata = { title: 'Undangan' }

const DEAD_ENDS: Record<
  Exclude<InvitationStatus, 'pending'>,
  { title: string; body: string }
> = {
  not_found: {
    title: 'Undangan tidak ditemukan',
    body: 'Tautannya mungkin terpotong saat disalin. Minta tautan baru ke pengurus yang mengundangmu.',
  },
  expired: {
    title: 'Undangan sudah kedaluwarsa',
    body: 'Undangan berlaku 7 hari. Minta pengurus yang mengundangmu membuat undangan baru.',
  },
  revoked: {
    title: 'Undangan sudah dibatalkan',
    body: 'Pengurus yang mengundangmu membatalkannya. Hubungi mereka kalau kamu masih perlu akses.',
  },
  accepted: {
    title: 'Undangan sudah dipakai',
    body: 'Kalau itu kamu, masuk saja — organisasinya sudah ada di akunmu.',
  },
}

/**
 * Where an invitation link lands (checklist 5.3). It has to work for three
 * people: someone with no account, someone signed out, and someone signed in.
 * The first two are sent to sign up or sign in and brought back here by
 * `next`; the third gets one button.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const valid = acceptInvitationSchema.shape.token.safeParse(token).success
  const [preview, user] = await Promise.all([
    valid ? getInvitationPreview(token) : null,
    getAuthUser(),
  ])

  const status: InvitationStatus = preview?.status ?? 'not_found'
  const here = `/invite/${token}`

  if (!preview || status !== 'pending' || !preview.role) {
    const dead = DEAD_ENDS[status === 'pending' ? 'not_found' : status]
    return (
      <div className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{dead.title}</h1>
          <p className="text-sm text-muted-foreground">{dead.body}</p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href={user.ok ? '/dashboard' : '/login'}>
            {user.ok ? 'Ke dashboard' : 'Masuk'}
          </Link>
        </Button>
      </div>
    )
  }

  const inviter = preview.inviterName || 'Pengurus'
  const roleLabel = ROLE_LABELS[preview.role]

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-xl font-semibold">Bergabung ke {preview.organizationName}</h1>
        <p className="text-sm text-muted-foreground">
          {inviter} mengundang{' '}
          <span className="font-medium text-foreground">{preview.emailHint}</span> sebagai{' '}
          <span className="font-medium text-foreground">{roleLabel}</span>.
        </p>
        <p className="text-sm text-muted-foreground">
          {roleLabel}: {ROLE_DESCRIPTIONS[preview.role]}
        </p>
      </div>

      {user.ok ? (
        <div className="space-y-3">
          <p className="text-sm">
            Kamu masuk sebagai <span className="font-medium">{user.value.email}</span>.
          </p>
          <AcceptInvitationButton
            token={token}
            organizationName={preview.organizationName}
          />
          <SignOutButton
            label="Pakai akun lain"
            redirectTo={`/login?next=${encodeURIComponent(here)}`}
          />
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Masuk atau daftar dengan email yang diundang, lalu terima undangannya.
          </p>
          <Button asChild className="w-full">
            <Link href={`/signup?next=${encodeURIComponent(here)}`}>
              Daftar untuk bergabung
            </Link>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href={`/login?next=${encodeURIComponent(here)}`}>
              Sudah punya akun? Masuk
            </Link>
          </Button>
        </div>
      )}
    </div>
  )
}

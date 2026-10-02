import type { Metadata } from 'next'
import Link from 'next/link'
import { GoogleButton } from '@/components/forms/google-button'
import { LoginForm } from '@/components/forms/login-form'
import { SignOutButton } from '@/components/forms/sign-out-button'
import { safeNextPath } from '@/lib/security/safe-next-path'

export const metadata: Metadata = { title: 'Masuk' }

const ERRORS: Record<string, string> = {
  missing_code: 'Tautan masuk tidak lengkap. Coba lagi.',
  invalid_code: 'Tautan masuk sudah kedaluwarsa atau sudah dipakai. Minta tautan baru.',
  other_browser:
    'Tautan ini tidak bisa dipakai di browser ini. Kalau email kamu sudah terverifikasi, masuk saja dengan password-mu.',
  provisioning: 'Akun kamu belum selesai disiapkan. Coba masuk lagi.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>
}) {
  const params = await searchParams
  const next = safeNextPath(params.next)
  const error = params.error ? ERRORS[params.error] : undefined

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Masuk ke SAMOSA</h1>
        <p className="text-sm text-muted-foreground">Kelola aspirasi dan laporanmu.</p>
      </div>

      {error ? (
        <div className="space-y-3">
          <p
            role="alert"
            className="rounded-control border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
          >
            {error}
          </p>
          {params.error === 'provisioning' ? (
            <SignOutButton label="Keluar dan coba akun lain" />
          ) : null}
        </div>
      ) : null}

      <LoginForm redirectTo={next} />

      <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        atau
        <span className="h-px flex-1 bg-border" />
      </div>

      <GoogleButton label="Masuk dengan Google" next={next} />

      <p className="text-center text-sm text-muted-foreground">
        Belum punya akun?{' '}
        <Link
          href={params.next ? `/signup?next=${encodeURIComponent(next)}` : '/signup'}
          className="font-medium text-foreground underline"
        >
          Daftar
        </Link>
      </p>
    </div>
  )
}

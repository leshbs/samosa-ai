import type { Metadata } from 'next'
import Link from 'next/link'
import { GoogleButton } from '@/components/forms/google-button'
import { LoginForm } from '@/components/forms/login-form'

export const metadata: Metadata = { title: 'Masuk' }

const MESSAGES: Record<string, string> = {
  confirm: 'Cek email kamu untuk menyelesaikan pendaftaran.',
}

const ERRORS: Record<string, string> = {
  missing_code: 'Tautan masuk tidak lengkap. Coba lagi.',
  invalid_code: 'Tautan masuk sudah kedaluwarsa. Minta tautan baru.',
  provisioning: 'Akun kamu belum punya organisasi. Hubungi admin.',
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; pending?: string; error?: string }>
}) {
  const params = await searchParams
  const next = params.next?.startsWith('/') ? params.next : '/dashboard'
  const notice = params.pending ? MESSAGES[params.pending] : undefined
  const error = params.error ? ERRORS[params.error] : undefined

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Masuk ke SAMOSA</h1>
        <p className="text-sm text-muted-foreground">
          Kelola aspirasi dan laporan organisasimu.
        </p>
      </div>

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      <LoginForm redirectTo={next} />

      <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        atau
        <span className="h-px flex-1 bg-border" />
      </div>

      <GoogleButton label="Masuk dengan Google" />

      <p className="text-center text-sm text-muted-foreground">
        Belum punya akun?{' '}
        <Link href="/signup" className="font-medium text-foreground underline">
          Daftar
        </Link>
      </p>
    </div>
  )
}

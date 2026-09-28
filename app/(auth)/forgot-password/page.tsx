import type { Metadata } from 'next'
import Link from 'next/link'
import { ForgotPasswordForm } from '@/components/forms/forgot-password-form'

export const metadata: Metadata = { title: 'Lupa password' }

const ERRORS: Record<string, string> = {
  expired: 'Tautan reset sudah kedaluwarsa atau sudah dipakai. Minta tautan baru.',
  other_browser:
    'Tautan reset harus dibuka di browser yang sama dengan tempat kamu memintanya. Minta tautan baru dari browser ini.',
}

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams
  const error = params.error ? ERRORS[params.error] : undefined

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Lupa password</h1>
        <p className="text-sm text-muted-foreground">
          Masukkan email akunmu. Kami kirim tautan untuk membuat password baru.
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-control border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      ) : null}

      <ForgotPasswordForm />

      <p className="text-center text-sm text-muted-foreground">
        Ingat password-mu?{' '}
        <Link href="/login" className="font-medium text-foreground underline">
          Masuk
        </Link>
      </p>
    </div>
  )
}

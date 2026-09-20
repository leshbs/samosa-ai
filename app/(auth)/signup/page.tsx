import type { Metadata } from 'next'
import Link from 'next/link'
import { GoogleButton } from '@/components/forms/google-button'
import { SignupForm } from '@/components/forms/signup-form'

export const metadata: Metadata = { title: 'Daftar' }

export default function SignupPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Buat akun SAMOSA</h1>
        <p className="text-sm text-muted-foreground">
          Organisasi baru dibuat otomatis, dan kamu jadi pemiliknya.
        </p>
      </div>

      <SignupForm />

      <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        atau
        <span className="h-px flex-1 bg-border" />
      </div>

      <GoogleButton label="Daftar dengan Google" />

      <p className="text-center text-sm text-muted-foreground">
        Sudah punya akun?{' '}
        <Link href="/login" className="font-medium text-foreground underline">
          Masuk
        </Link>
      </p>
    </div>
  )
}

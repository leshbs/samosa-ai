import type { Metadata } from 'next'
import Link from 'next/link'
import { ResendConfirmationForm } from '@/components/forms/resend-confirmation-form'

export const metadata: Metadata = { title: 'Verifikasi email' }

export default function VerifyEmailPage() {
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Cek inbox kamu</h1>
        <p className="text-sm text-muted-foreground">
          Kami mengirim tautan verifikasi ke email kamu. Buka tautan itu untuk
          mengaktifkan akun — boleh dari HP atau perangkat lain.
        </p>
      </div>

      <ResendConfirmationForm />

      <p className="text-center text-sm text-muted-foreground">
        Sudah verifikasi?{' '}
        <Link href="/login" className="font-medium text-foreground underline">
          Masuk
        </Link>
      </p>
    </div>
  )
}

import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Daftar' }

export default function SignupPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Buat akun</h1>
      <p className="text-sm text-muted-foreground">
        Pendaftaran organisasi baru dipasang di sini.
      </p>
    </div>
  )
}

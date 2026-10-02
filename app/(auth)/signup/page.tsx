import type { Metadata } from 'next'
import Link from 'next/link'
import { GoogleButton } from '@/components/forms/google-button'
import { SignupForm } from '@/components/forms/signup-form'
import { safeNextPath } from '@/lib/security/safe-next-path'

export const metadata: Metadata = { title: 'Daftar' }

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const params = await searchParams
  // Only a real path survives; anything else signs up the ordinary way.
  const next = params.next ? safeNextPath(params.next) : undefined
  const joining = Boolean(next?.startsWith('/invite/'))

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Buat akun SAMOSA</h1>
        <p className="text-sm text-muted-foreground">
          {joining
            ? 'Pakai email yang diundang. Setelah akunmu jadi, kamu kembali ke undangan untuk bergabung.'
            : 'Ruang kerjamu langsung siap begitu akun jadi. Rekan bisa diundang kapan saja.'}
        </p>
      </div>

      <SignupForm next={next} />

      <div className="flex items-center gap-3 text-xs uppercase text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        atau
        <span className="h-px flex-1 bg-border" />
      </div>

      <GoogleButton label="Daftar dengan Google" next={next} />

      <p className="text-center text-sm text-muted-foreground">
        Sudah punya akun?{' '}
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
          className="font-medium text-foreground underline"
        >
          Masuk
        </Link>
      </p>
    </div>
  )
}

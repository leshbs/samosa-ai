import type { Metadata } from 'next'

export const metadata: Metadata = { title: 'Masuk' }

export default function LoginPage() {
  return (
    <div className="space-y-2">
      <h1 className="text-xl font-semibold">Masuk ke SAMOSA</h1>
      <p className="text-sm text-muted-foreground">
        Form Supabase Auth (email magic link + Google OAuth) dipasang di sini.
      </p>
    </div>
  )
}

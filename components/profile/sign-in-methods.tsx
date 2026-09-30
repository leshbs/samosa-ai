'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authRedirectUrl } from '@/lib/supabase/auth-links'
import { createClient } from '@/lib/supabase/client'

/** Supabase says this when "Allow manual linking" is off in the dashboard. */
function isLinkingDisabled(message: string): boolean {
  return /manual linking/i.test(message)
}

/**
 * Checklist 5.8: which doors open this account, and a way to add the other
 * one. A Google-only account gets a password through the same page a reset
 * lands on — setting one needs nothing but the session it already has.
 *
 * Linking Google is a redirect through Supabase and back to /callback, the
 * same round trip as signing in with Google, ending on this page.
 */
export function SignInMethods({
  email,
  hasPassword,
  googleEmail,
}: {
  email: string
  hasPassword: boolean
  /** Null when no Google account is linked. */
  googleEmail: string | null
}) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function linkGoogle() {
    setPending(true)
    setError(null)
    const { error: linkError } = await createClient().auth.linkIdentity({
      provider: 'google',
      options: { redirectTo: authRedirectUrl('/callback', '/profile') },
    })
    if (linkError) {
      setError(
        isLinkingDisabled(linkError.message)
          ? 'Menautkan akun belum diaktifkan di server ini. Minta admin SAMOSA menyalakannya.'
          : 'Google sedang tidak bisa dihubungi. Coba lagi.',
      )
      setPending(false)
    }
  }

  return (
    <ul className="divide-y">
      <li className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Email dan password</p>
          <p className="truncate text-xs text-muted-foreground">
            {hasPassword ? `Aktif · ${email}` : 'Belum ada password untuk akun ini'}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/reset-password">
            {hasPassword ? 'Ganti password' : 'Buat password'}
          </Link>
        </Button>
      </li>
      <li className="flex flex-wrap items-center justify-between gap-3 py-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">Google</p>
          <p className="truncate text-xs text-muted-foreground">
            {googleEmail !== null
              ? `Tertaut${googleEmail ? ` · ${googleEmail}` : ''}`
              : 'Belum tertaut'}
          </p>
        </div>
        {googleEmail === null ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={linkGoogle}
            disabled={pending}
          >
            {pending ? 'Menghubungkan…' : 'Tautkan Google'}
          </Button>
        ) : null}
      </li>
      {error ? (
        <li role="alert" className="py-2 text-sm text-destructive">
          {error}
        </li>
      ) : null}
    </ul>
  )
}

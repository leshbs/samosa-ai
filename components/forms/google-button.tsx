'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { authRedirectUrl } from '@/lib/supabase/auth-links'
import { createClient } from '@/lib/supabase/client'

/**
 * Google is configured in the Supabase dashboard, so the whole flow is a
 * redirect: Supabase → Google → back to /callback, which mints the session.
 */
export function GoogleButton({ label, next }: { label: string; next?: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setPending(true)
    setError(null)

    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: authRedirectUrl('/callback', next) },
    })

    if (oauthError) {
      setError('Google sedang tidak bisa dihubungi. Coba lagi.')
      setPending(false)
    }
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={signIn}
        disabled={pending}
      >
        {pending ? 'Menghubungkan…' : label}
      </Button>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

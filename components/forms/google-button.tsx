'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'
import { clientEnv } from '@/lib/env'

/**
 * Google is configured in the Supabase dashboard, so the whole flow is a
 * redirect: Supabase → Google → back to /callback, which mints the session.
 */
export function GoogleButton({ label }: { label: string }) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function signIn() {
    setPending(true)
    setError(null)

    const supabase = createClient()
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${clientEnv.NEXT_PUBLIC_APP_URL}/callback` },
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

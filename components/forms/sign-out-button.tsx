'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/client'

/**
 * Shown on the login page to a user who is signed in but cannot get past it —
 * an account with no organization. Without this they can read why they are
 * stuck but have no way to leave the state.
 */
export function SignOutButton({ label }: { label: string }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function signOut() {
    setPending(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    router.refresh()
  }

  return (
    <Button
      type="button"
      variant="outline"
      className="w-full"
      onClick={signOut}
      disabled={pending}
    >
      {pending ? 'Keluar…' : label}
    </Button>
  )
}

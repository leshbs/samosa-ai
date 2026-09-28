import { clientEnv } from '@/lib/env'

/**
 * Absolute URLs Supabase sends the user back to. They must be absolute, and
 * their origin must be on the project's redirect allow-list (Supabase dashboard
 * → Authentication → URL Configuration), or Supabase silently falls back to the
 * Site URL and the link lands on the landing page with nothing to redeem it.
 */
export function authRedirectUrl(route: '/callback' | '/confirm', next?: string): string {
  const url = new URL(route, clientEnv.NEXT_PUBLIC_APP_URL)
  if (next) url.searchParams.set('next', next)
  return url.toString()
}

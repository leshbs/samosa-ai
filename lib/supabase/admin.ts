import 'server-only'

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { clientEnv, serverEnv } from '@/lib/env'
import type { Database } from '@/types/database'

/**
 * Service-role client: bypasses RLS entirely. Only for background jobs that
 * have already authorized the caller themselves (e.g. the analysis worker).
 * Never expose this to a request handler that takes user-controlled ids.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    clientEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv().SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

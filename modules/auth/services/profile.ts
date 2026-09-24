import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'

/**
 * The display name lives in the auth user's metadata rather than a profiles
 * table. It is one string that only ever belongs to one user, nothing joins to
 * it, and a table would mean a migration plus RLS plus a row to keep in step
 * with auth.users. Revisit if profiles ever grow a second field.
 */
export async function updateDisplayName(
  name: string,
): Promise<Result<{ displayName: string }, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase.auth.updateUser({ data: { full_name: name } })
  if (error || !data.user) {
    return err(appError(ERROR_CODES.INTERNAL, 'Nama tidak bisa disimpan'))
  }

  return ok({ displayName: name })
}

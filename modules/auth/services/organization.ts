import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'

/**
 * Renames the organization. The slug is deliberately left alone: it is in URLs
 * and in nothing anyone typed, so regenerating it on every rename would break
 * links to buy a cosmetic match.
 *
 * Goes through the session client, so the RLS policy is the real boundary even
 * if a caller forgets the role check.
 */
export async function renameOrganization(
  organizationId: string,
  name: string,
): Promise<Result<{ name: string }, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('organizations')
    .update({ name })
    .eq('id', organizationId)
    .select('name')
    .maybeSingle()

  if (error) {
    return err(appError(ERROR_CODES.INTERNAL, 'Nama organisasi tidak bisa diubah'))
  }
  // RLS turns "not allowed" into "no rows updated" rather than an error.
  if (!data) {
    return err(
      appError(ERROR_CODES.FORBIDDEN, 'Kamu tidak bisa mengubah nama organisasi ini'),
    )
  }

  return ok({ name: String(data.name) })
}

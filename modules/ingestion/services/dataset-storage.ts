import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/modules/shared'

export const DATASET_BUCKET = 'datasets'

/**
 * Removes the raw upload behind a dataset.
 *
 * The service-role client is required, not a convenience: the `datasets`
 * bucket has a read policy and no delete policy, so a request-scoped client
 * cannot remove anything. Authorization happens before this is called — the
 * dataset row is deleted under RLS first, and only a delete the database
 * allowed hands us a path to remove.
 *
 * Never throws and never fails the caller. By the time this runs the row is
 * already gone, so there is nothing left to roll back to; an unreachable
 * bucket must leave a loud log line rather than a half-deleted dataset the
 * user is told still exists. The log line is the trigger for a sweep, because
 * the file it names holds respondent data the privacy policy promises to
 * delete.
 *
 * The path is logged even though it ends in a user-supplied filename: it is
 * the only handle anyone has on the leftover file, and a log line that cannot
 * name the object it is warning about is not worth writing.
 */
export async function removeDatasetObject(storagePath: string | null): Promise<void> {
  if (!storagePath) return

  try {
    const supabase = createAdminClient()
    const { error } = await supabase.storage.from(DATASET_BUCKET).remove([storagePath])

    if (error) {
      logger.error('ingestion.dataset.object_orphaned', { storagePath })
    }
  } catch {
    logger.error('ingestion.dataset.object_orphaned', { storagePath })
  }
}

import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import type { UpdateOrganizationInput } from '@/types/api'
import type { Database } from '@/types/database'
import {
  DEFAULT_REPORT_PREFERENCES,
  DEFAULT_TIME_ZONE,
  isOrgTimeZone,
  type OrgRole,
  type OrgTimeZone,
  type ReportPreferences,
} from '@/types/domain'
import { can } from '../policies/org-policy'
import { purgeOrganizationBranding, signBrandingUrl } from './branding'

export type OrganizationSettings = {
  id: string
  name: string
  slug: string
  logoPath: string | null
  /** Signed, short-lived; null when there is no logo or it cannot be signed. */
  logoUrl: string | null
  timezone: OrgTimeZone
  reportPreferences: ReportPreferences
  createdAt: string
}

type OrganizationRow = Record<string, unknown>

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

/** `*` in, defaults for anything a pending migration has not added yet. */
function toSettings(row: OrganizationRow, logoUrl: string | null): OrganizationSettings {
  return {
    id: String(row.id),
    name: String(row.name ?? ''),
    slug: String(row.slug ?? ''),
    logoPath: typeof row.logo_path === 'string' ? row.logo_path : null,
    logoUrl,
    timezone: isOrgTimeZone(row.timezone) ? row.timezone : DEFAULT_TIME_ZONE,
    reportPreferences: {
      includeQuotes: flag(
        row.report_include_quotes,
        DEFAULT_REPORT_PREFERENCES.includeQuotes,
      ),
      includeTopicTail: flag(
        row.report_include_topic_tail,
        DEFAULT_REPORT_PREFERENCES.includeTopicTail,
      ),
      includeProvenance: flag(
        row.report_include_provenance,
        DEFAULT_REPORT_PREFERENCES.includeProvenance,
      ),
    },
    createdAt: String(row.created_at ?? ''),
  }
}

/** Read under RLS: an id from another tenant comes back as not found. */
export async function getOrganizationSettings(
  organizationId: string,
): Promise<Result<OrganizationSettings, AppError>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('organizations')
    .select('*')
    .eq('id', organizationId)
    .maybeSingle()

  if (error || !data) {
    return err(appError(ERROR_CODES.NOT_FOUND, 'Organisasi tidak ditemukan'))
  }

  const row = data as OrganizationRow
  const logoPath = typeof row.logo_path === 'string' ? row.logo_path : null
  return ok(toSettings(row, await signBrandingUrl(logoPath)))
}

/**
 * Name, timezone and report defaults in one PATCH. Only the keys that were
 * sent are written, so toggling one report default never races another.
 *
 * Goes through the session client, so the owner-only RLS policy is the real
 * boundary even if a caller forgets the role check. The slug is deliberately
 * left alone: it is in URLs and in nothing anyone typed.
 */
export async function updateOrganization(
  organizationId: string,
  patch: UpdateOrganizationInput,
): Promise<Result<OrganizationSettings, AppError>> {
  const update: Database['public']['Tables']['organizations']['Update'] = {}
  if (patch.name !== undefined) update.name = patch.name
  if (patch.timezone !== undefined) update.timezone = patch.timezone
  if (patch.reportIncludeQuotes !== undefined) {
    update.report_include_quotes = patch.reportIncludeQuotes
  }
  if (patch.reportIncludeTopicTail !== undefined) {
    update.report_include_topic_tail = patch.reportIncludeTopicTail
  }
  if (patch.reportIncludeProvenance !== undefined) {
    update.report_include_provenance = patch.reportIncludeProvenance
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organizations')
    .update(update)
    .eq('id', organizationId)
    .select('*')
    .maybeSingle()

  if (error) {
    logger.warn('auth.organization.update_failed', { code: error.code })
    return err(
      appError(ERROR_CODES.INTERNAL, 'Pengaturan organisasi tidak bisa disimpan'),
    )
  }
  // RLS turns "not allowed" into "no rows updated" rather than an error.
  if (!data) {
    return err(
      appError(ERROR_CODES.FORBIDDEN, 'Hanya pemilik yang bisa mengubah organisasi ini'),
    )
  }

  const row = data as OrganizationRow
  const logoPath = typeof row.logo_path === 'string' ? row.logo_path : null
  return ok(toSettings(row, await signBrandingUrl(logoPath)))
}

/**
 * Whitespace and case do not count: the point of typing the name is intent,
 * and "osis nusantara " is as deliberate as "OSIS Nusantara".
 */
export function confirmationMatches(typed: string, organizationName: string): boolean {
  const normalize = (value: string) =>
    value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
  return normalize(typed) === normalize(organizationName) && normalize(typed) !== ''
}

export type OrganizationActor = {
  organizationId: string
  organizationName: string
  role: OrgRole
}

/**
 * Deletes the organization and — by cascade — every dataset, response, job,
 * result, report, membership and invitation in it. The logo goes too. Raw
 * uploads live in the ingestion module's bucket, so the caller purges those
 * with `purgeOrganizationFiles` once this has succeeded.
 */
export async function deleteOrganization(
  actor: OrganizationActor,
  confirmation: string,
): Promise<Result<void, AppError>> {
  if (!can(actor.role, 'org:manage')) {
    return err(
      appError(ERROR_CODES.FORBIDDEN, 'Hanya pemilik yang bisa menghapus organisasi'),
    )
  }
  if (!confirmationMatches(confirmation, actor.organizationName)) {
    return err(
      appError(
        ERROR_CODES.VALIDATION,
        'Nama yang diketik tidak sama dengan nama organisasi',
      ),
    )
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('organizations')
    .delete()
    .eq('id', actor.organizationId)
    .select('id')

  if (error) {
    logger.error('auth.organization.delete_failed', { code: error.code })
    return err(
      appError(ERROR_CODES.INTERNAL, 'Organisasi tidak bisa dihapus. Coba lagi.'),
    )
  }
  if (!data || data.length === 0) {
    return err(
      appError(ERROR_CODES.FORBIDDEN, 'Hanya pemilik yang bisa menghapus organisasi'),
    )
  }

  logger.info('auth.organization.deleted', { organizationId: actor.organizationId })
  await purgeOrganizationBranding(actor.organizationId)
  return ok(undefined)
}

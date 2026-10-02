import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { FULL_NAME_METADATA_KEY } from '@/lib/supabase/user-metadata'
import { ERROR_CODES, appError, err, logger, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { signBrandingUrl } from './branding'

/**
 * Profiles moved out of auth metadata into their own table once they grew a
 * second field and other members needed to read them (checklist 5.8).
 * Metadata is still the fallback for the name, because Google fills it in on
 * an OAuth signup before any profile row exists.
 */

const MAX_NAME = 80

function metadataName(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return ''
  const value = (metadata as Record<string, unknown>)[FULL_NAME_METADATA_KEY]
  return typeof value === 'string' ? value.trim().slice(0, MAX_NAME) : ''
}

export type ProfilePatch = {
  displayName?: string
  title?: string
  notifyAnalysisFinished?: boolean
}

export type Profile = {
  displayName: string
  title: string
  notifyAnalysisFinished: boolean
}

/**
 * Saves the caller's own profile. The row is written whole, so the fields the
 * patch leaves out are read first — otherwise saving a title would blank a
 * name that so far lived only in metadata.
 */
export async function updateProfile(
  patch: ProfilePatch,
): Promise<Result<Profile, AppError>> {
  const supabase = await createClient()

  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) {
    return err(appError(ERROR_CODES.UNAUTHORIZED, 'Kamu belum masuk'))
  }

  const { data: existing } = await supabase
    .from('profiles')
    .select('display_name, title, notify_analysis_finished')
    .eq('user_id', auth.user.id)
    .maybeSingle()

  const row = {
    user_id: auth.user.id,
    display_name:
      patch.displayName ??
      (existing?.display_name || metadataName(auth.user.user_metadata)),
    title: patch.title ?? existing?.title ?? '',
    notify_analysis_finished:
      patch.notifyAnalysisFinished ?? existing?.notify_analysis_finished ?? true,
    updated_at: new Date().toISOString(),
  }

  const { data, error } = await supabase
    .from('profiles')
    .upsert(row, { onConflict: 'user_id' })
    .select('display_name, title, notify_analysis_finished')
    .single()

  if (error || !data) {
    return err(appError(ERROR_CODES.INTERNAL, 'Profil tidak bisa disimpan'))
  }

  return ok({
    displayName: data.display_name,
    title: data.title,
    notifyAnalysisFinished: data.notify_analysis_finished,
  })
}

/**
 * Makes sure a profile row exists, seeded from metadata. Runs on every sign-in
 * next to provisioning, so other members see a name for someone who has never
 * opened the profile page. Never fails the sign-in.
 */
export async function ensureProfile(userId: string, metadata: unknown): Promise<void> {
  const { error } = await createAdminClient()
    .from('profiles')
    .upsert(
      { user_id: userId, display_name: metadataName(metadata) },
      { onConflict: 'user_id', ignoreDuplicates: true },
    )
  if (error) logger.warn('auth.profile.ensure_failed', { code: error.code })
}

/**
 * Whether this person has been here before. ensureProfile runs at the end of
 * every first arrival, so the row doubles as the record of it — which is what
 * lets a later sign-in tell "new" from "has no workspace any more" (ADR-0012).
 * A failed lookup counts as "has": the cost of being wrong that way is a
 * welcome page, the other way is a workspace nobody asked for.
 */
export async function hasProfile(userId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) logger.warn('auth.profile.lookup_failed', { code: error.code })
  return Boolean(data) || Boolean(error)
}

export type ProfileDetails = Profile & {
  email: string
  avatarPath: string | null
  avatarUrl: string | null
  /** Can sign in with email + password, whatever the providers list says. */
  hasPassword: boolean
  /** Email of the linked Google account, or null when none is linked. */
  googleEmail: string | null
}

type Identity = { provider?: string; identity_data?: Record<string, unknown> }

function googleEmailOf(identities: unknown): string | null {
  if (!Array.isArray(identities)) return null
  const google = (identities as Identity[]).find(
    (identity) => identity.provider === 'google',
  )
  if (!google) return null
  const email = google.identity_data?.email
  return typeof email === 'string' ? email : ''
}

/** Everything the profile page shows about the signed-in user. */
export async function getProfileDetails(): Promise<Result<ProfileDetails, AppError>> {
  const supabase = await createClient()

  const { data: auth, error: authError } = await supabase.auth.getUser()
  if (authError || !auth.user) {
    return err(appError(ERROR_CODES.UNAUTHORIZED, 'Kamu belum masuk'))
  }
  const user = auth.user

  const [{ data: profile }, password] = await Promise.all([
    supabase
      .from('profiles')
      .select('display_name, title, avatar_path, notify_analysis_finished')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.rpc('current_user_has_password'),
  ])

  // The rpc is the only honest answer (see the migration); the providers list
  // is a fallback for a database that does not have the function yet.
  const providers: unknown = user.app_metadata?.providers
  const hasPassword =
    typeof password.data === 'boolean'
      ? password.data
      : Array.isArray(providers) && providers.includes('email')

  const avatarPath = profile?.avatar_path ?? null

  return ok({
    displayName: profile?.display_name?.trim() || metadataName(user.user_metadata),
    title: profile?.title ?? '',
    notifyAnalysisFinished: profile?.notify_analysis_finished ?? true,
    email: user.email ?? '',
    avatarPath,
    avatarUrl: await signBrandingUrl(avatarPath),
    hasPassword,
    googleEmail: googleEmailOf(user.identities),
  })
}

export type PersonSummary = { displayName: string; title: string }

/**
 * Names and titles for provenance lines like "dijalankan oleh", read under
 * RLS: the caller's fellow members, and people who ran an analysis in one of
 * the caller's workspaces and have since left it. Anyone else simply does not
 * come back.
 */
export async function getPeople(
  userIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, PersonSummary>> {
  const ids = [...new Set(userIds.filter((id): id is string => Boolean(id)))]
  if (ids.length === 0) return new Map()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('user_id, display_name, title')
    .in('user_id', ids)

  if (error || !data) return new Map()
  return new Map(
    data.map((row) => [
      String(row.user_id),
      { displayName: row.display_name, title: row.title },
    ]),
  )
}

export type NotificationTarget = {
  email: string
  displayName: string
  notifyAnalysisFinished: boolean
}

/**
 * Who to email about a background job, and whether they want it. Service role:
 * the job runs with no session, and the userId comes from the job row.
 */
export async function getNotificationTarget(
  userId: string,
): Promise<NotificationTarget | null> {
  const supabase = createAdminClient()

  const [{ data: user }, { data: profile }] = await Promise.all([
    supabase.auth.admin.getUserById(userId),
    supabase
      .from('profiles')
      .select('display_name, notify_analysis_finished')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  const email = user.user?.email
  if (!email) return null

  return {
    email,
    displayName: profile?.display_name?.trim() || metadataName(user.user?.user_metadata),
    notifyAnalysisFinished: profile?.notify_analysis_finished ?? true,
  }
}

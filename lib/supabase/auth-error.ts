import type { AuthError } from '@supabase/supabase-js'

/**
 * Tells "we never got an answer from GoTrue" apart from "GoTrue rejected the
 * credentials".
 *
 * Supabase reports a failed fetch as status 0, and a broken auth server as 5xx;
 * neither says anything about the email or the password. Reporting those as bad
 * credentials sends the user off re-typing a password that was correct, and
 * hides a real outage behind a plausible-looking message.
 */
export function isBackendUnreachable(error: AuthError): boolean {
  return error.status === undefined || error.status === 0 || error.status >= 500
}

export const BACKEND_UNREACHABLE_MESSAGE =
  'Server sedang tidak bisa dihubungi. Coba lagi sebentar lagi.'

export const RATE_LIMITED_MESSAGE =
  'Terlalu banyak percobaan. Tunggu beberapa menit, lalu coba lagi.'

/**
 * GoTrue answers 429 for both its per-IP limits and its per-email "wait 60
 * seconds before asking for another email" rule; the codes all start `over_`.
 */
export function isRateLimited(error: AuthError): boolean {
  return error.status === 429 || (error.code?.startsWith('over_') ?? false)
}

/**
 * The password was right but the address was never confirmed. Saying "wrong
 * password" here sends the user to reset a password that works.
 */
export function isEmailNotConfirmed(error: AuthError): boolean {
  return error.code === 'email_not_confirmed'
}

/** Messages for the rejections a user can actually do something about. */
const USER_FIXABLE: Partial<Record<string, string>> = {
  weak_password: 'Password terlalu lemah. Pakai minimal 8 karakter yang sulit ditebak.',
  same_password: 'Password baru harus berbeda dari password lama.',
  email_address_invalid: 'Alamat email ini tidak bisa dipakai. Coba email lain.',
  // Only reported with email confirmation off; with it on, Supabase hides it.
  user_already_exists: 'Email ini sudah terdaftar. Silakan masuk.',
}

/**
 * One place that turns a GoTrue error into a sentence. Outages and rate limits
 * are named for what they are; anything else falls back to the caller's
 * message, which knows the context (and whether it must stay vague).
 */
export function describeAuthError(error: AuthError, fallback: string): string {
  if (isRateLimited(error)) return RATE_LIMITED_MESSAGE
  if (isBackendUnreachable(error)) return BACKEND_UNREACHABLE_MESSAGE
  return (error.code && USER_FIXABLE[error.code]) ?? fallback
}

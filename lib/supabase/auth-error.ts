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

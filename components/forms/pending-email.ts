/**
 * Hands the address from the signup or login form to /verify-email without
 * putting it in the URL, where it would end up in history and request logs.
 * Session storage can be unavailable (private windows, blocked site data), so
 * every access is guarded and a miss simply leaves the field empty.
 */
const KEY = 'samosa:pending-email'

export function rememberPendingEmail(email: string): void {
  try {
    sessionStorage.setItem(KEY, email)
  } catch {
    // The user types it again; nothing depends on this succeeding.
  }
}

export function readPendingEmail(): string {
  try {
    return sessionStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

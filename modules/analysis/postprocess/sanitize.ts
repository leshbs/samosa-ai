import { MAX_RESPONSE_LENGTH } from '@/types/api'

/** Phrases that only appear when someone is trying to steer the model. */
const INJECTION_PATTERNS: RegExp[] = [
  /ignore (all )?(previous|prior|above) instructions/i,
  /abaikan (semua )?(instruksi|perintah) (sebelumnya|di atas)/i,
  /disregard the (system|above)/i,
  /you are now\b/i,
  /kamu sekarang adalah\b/i,
  /<\/?(system|assistant)>/i,
]

export type SanitizedText = {
  text: string
  truncated: boolean
  /** True when an injection-looking phrase was neutralized; worth logging. */
  flagged: boolean
}

/**
 * User text reaches the model as data, never as instructions. We strip control
 * characters, cap length to bound cost, and defang the tag delimiters the
 * prompt uses to frame each response.
 */
export function sanitizeResponseText(input: string): SanitizedText {
  // eslint-disable-next-line no-control-regex -- deliberately targeting control chars
  const withoutControlChars = input.replace(
    /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g,
    ' ',
  )
  const collapsed = withoutControlChars.replace(/\s+/g, ' ').trim()

  const flagged = INJECTION_PATTERNS.some((pattern) => pattern.test(collapsed))
  const defanged = collapsed.replace(/[<>]/g, (char) => (char === '<' ? '‹' : '›'))

  const truncated = defanged.length > MAX_RESPONSE_LENGTH
  return {
    text: truncated ? defanged.slice(0, MAX_RESPONSE_LENGTH) : defanged,
    truncated,
    flagged,
  }
}

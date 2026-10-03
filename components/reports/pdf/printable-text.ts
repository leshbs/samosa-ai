/**
 * The PDF is set in one typeface, and a typeface draws only the characters it
 * has. A browser quietly borrows the rest from the system — that is how the
 * print page shows "🙏" — but react-pdf falls back to a built-in face that
 * prints an emoji, or a word in another script, as stray symbols.
 *
 * So what the face cannot draw is left out, and the sentence around it stays
 * readable. The print page still shows such a response as written.
 */
export function printableText(
  text: string,
  canDraw: (codePoint: number) => boolean,
): string {
  let kept = ''
  for (const character of text) {
    // Line breaks and spaces have no glyph to look up, and must survive.
    if (/\s/.test(character) || canDraw(character.codePointAt(0) ?? 0)) {
      kept += character
    }
  }
  return (
    kept
      // "duluan 😭 ya" must not become "duluan  ya".
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/[ \t]+$/gm, '')
      .replace(/^[ \t]+/gm, '')
  )
}

/** Applies `change` to every string in a JSON value, leaving its shape alone. */
export function mapStrings<T>(value: T, change: (text: string) => string): T {
  if (typeof value === 'string') return change(value) as T
  if (Array.isArray(value)) return value.map((item) => mapStrings(item, change)) as T
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, mapStrings(item, change)]),
    ) as T
  }
  return value
}

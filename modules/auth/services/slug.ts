/** Slugs are user-visible and unique per organization, so keep them predictable. */
const MAX_SLUG_LENGTH = 48

export function slugify(name: string): string {
  const slug = name
    .normalize('NFKD')
    // Strip combining marks so "Sekolah Ngawi" and "Sékolah Ngawi" agree.
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '')

  // An all-symbol name would otherwise produce an empty, non-unique slug.
  return slug || 'org'
}

/** Appends a short suffix so a retry after a slug collision can succeed. */
export function withSuffix(slug: string, suffix: string): string {
  return `${slug.slice(0, MAX_SLUG_LENGTH - suffix.length - 1)}-${suffix}`
}

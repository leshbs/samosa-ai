/**
 * Who is legally responsible for the data, and how to reach them.
 *
 * Kept in one file, with obvious placeholders, because a privacy policy that
 * names nobody is not a privacy policy. Everything downstream reads these
 * constants, and `isPlaceholder` drives a warning banner on the pages
 * themselves — so an unfinished policy announces itself in the product rather
 * than waiting to be discovered by whoever needed it.
 *
 * Replace all four, then the banner disappears on its own.
 *
 * It sits in `lib/` rather than beside the pages because the legal components
 * need it too, and dependencies point one way: app/ -> modules/ -> lib/.
 */
export const CONTROLLER = {
  /** Legal name of the operator — a person or an organisation. */
  legalName: 'TODO: nama penanggung jawab SAMOSA',
  /** Where data subjects send access, correction and deletion requests. */
  contactEmail: 'TODO@example.com',
  /** Postal address; UU PDP expects a reachable one. */
  address: 'TODO: alamat surat',
  /** Plain-language jurisdiction the operator is based in. */
  jurisdiction: 'Indonesia',
} as const

export const LAST_UPDATED = '2026-10-03'

export function isPlaceholder(): boolean {
  return Object.values(CONTROLLER).some((value) => value.startsWith('TODO'))
}

/** Where the analysed text actually goes, named so the policy can be specific. */
export const PROCESSORS = [
  {
    name: 'Supabase',
    role: {
      id: 'Basis data, autentikasi, dan penyimpanan file',
      en: 'Database, authentication and file storage',
    },
    region: 'ap-northeast-1 (Tokyo)',
  },
  {
    name: 'OpenAI',
    role: {
      id: 'Analisis sentimen, topik, dan ringkasan',
      en: 'Sentiment, topic and summary analysis',
    },
    region: 'Amerika Serikat / United States',
  },
  {
    name: 'Vercel',
    role: { id: 'Hosting aplikasi', en: 'Application hosting' },
    region: 'Global CDN',
  },
] as const

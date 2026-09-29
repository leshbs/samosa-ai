import { z } from 'zod'

/**
 * Env vars are validated once at module load so a misconfigured deployment
 * fails on startup instead of at the first request that happens to need a key.
 */
/**
 * Strips what a dashboard paste leaves around a value: surrounding whitespace,
 * a trailing newline, one pair of quotes copied along from a .env line. Only
 * for values sent verbatim to a provider — OpenAI answers `"gpt-4o-mini"` or
 * `gpt-4o-mini ` with a bare "400 invalid model ID", which failed every batch
 * of every job in production without saying which setting was wrong. Blank
 * after cleaning counts as unset, so a default still applies.
 */
export function unwrapPastedValue(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  const quoted = /^(["'])(.*)\1$/s.exec(trimmed)
  const unwrapped = (quoted ? quoted[2] : trimmed)?.trim() ?? ''
  return unwrapped === '' ? undefined : unwrapped
}

const clientSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
  /**
   * Whether the app sends email links: signup verification and password reset.
   * Off until there is a domain to send from (docs/auth-setup.md); the Supabase
   * "Confirm email" switch has to agree with it, or signups wait on an email
   * that never comes. Anything but the literal "true" is off.
   */
  NEXT_PUBLIC_EMAIL_LINKS_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === 'true'),
})

const serverSchema = clientSchema.extend({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.preprocess(unwrapPastedValue, z.string().min(1)),
  OPENAI_MODEL: z.preprocess(unwrapPastedValue, z.string().default('gpt-4o-mini')),
  GOOGLE_OAUTH_CLIENT_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_SECRET: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  /** Shared secret the background worker presents to the job webhook. */
  WORKER_SECRET: z.string().min(16),
  /**
   * Bearer token Vercel Cron presents to the stuck-job sweeper. Optional so an
   * existing deployment keeps booting without it; the route itself fails closed
   * when it is missing, which turns the sweeper off rather than opening it.
   */
  CRON_SECRET: z.string().min(16).optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

export type ClientEnv = z.infer<typeof clientSchema>
export type ServerEnv = z.infer<typeof serverSchema>

function parse<T extends z.ZodTypeAny>(schema: T, source: unknown): z.infer<T> {
  const result = schema.safeParse(source)
  if (!result.success) {
    const missing = result.error.issues.map((i) => i.path.join('.')).join(', ')
    throw new Error(`Invalid environment configuration: ${missing}`)
  }
  return result.data
}

/**
 * Next.js inlines NEXT_PUBLIC_* only for statically referenced properties,
 * so they are listed explicitly rather than spread from process.env.
 */
export const clientEnv: ClientEnv = parse(clientSchema, {
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
  NEXT_PUBLIC_EMAIL_LINKS_ENABLED: process.env.NEXT_PUBLIC_EMAIL_LINKS_ENABLED,
})

let cachedServerEnv: ServerEnv | undefined

/** Lazy so that importing this module from a client component stays safe. */
export function serverEnv(): ServerEnv {
  if (typeof window !== 'undefined') {
    throw new Error('serverEnv() must not be called in the browser')
  }
  cachedServerEnv ??= parse(serverSchema, process.env)
  return cachedServerEnv
}

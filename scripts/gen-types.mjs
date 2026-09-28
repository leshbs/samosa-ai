/**
 * Regenerates `types/database.ts` from the linked Supabase project.
 *
 *   pnpm db:types
 *
 * This replaced `supabase gen types typescript --local`, which pointed at the
 * Docker stack on port 54322 — a database that is empty on a machine without
 * Docker, and that drifts from the hosted project the app actually talks to.
 * Types generated from the wrong database make `pnpm check` a check of nothing:
 * TypeScript happily verifies code against a schema no deployment has.
 *
 * `--linked` needs one credential, which is not in `.env.local` because it is
 * an account credential rather than a project one:
 *
 *   supabase login                       # opens a browser, stores a token
 *   SUPABASE_ACCESS_TOKEN=sbp_...        # or set this in the environment
 *
 * The header is written here rather than by hand so that regenerating never
 * silently drops it.
 */
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'

const OUT = 'types/database.ts'

const HEADER = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by \`pnpm db:types\` from the linked Supabase project. Hand edits are
 * lost on the next run, and a hand-maintained schema type is worse than none:
 * it makes a passing typecheck mean "matches what someone remembered" instead
 * of "matches the database".
 *
 * After a migration, run \`pnpm db:types\` and commit the diff with it.
 */

`

let generated
try {
  generated = execFileSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['supabase', 'gen', 'types', 'typescript', '--linked'],
    {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 32 * 1024 * 1024,
    },
  )
} catch {
  console.error(
    '\nCould not generate types from the linked project.\n\n' +
      'Most likely the CLI has no access token. Fix with either:\n' +
      '  supabase login\n' +
      '  $env:SUPABASE_ACCESS_TOKEN = "sbp_..."   # PowerShell\n\n' +
      'The previous types/database.ts was left untouched.',
  )
  process.exit(1)
}

// A CLI that failed in a way it reported on stdout must not overwrite the file
// with an error message shaped like TypeScript.
if (!generated.includes('export type Database')) {
  console.error(
    '\nThe CLI returned something that is not a schema. types/database.ts was\n' +
      'left untouched. Output began:\n\n' +
      generated.slice(0, 400),
  )
  process.exit(1)
}

writeFileSync(OUT, HEADER + generated.trimStart(), 'utf8')
console.log(`Wrote ${OUT} from the linked project.`)

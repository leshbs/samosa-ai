# SAMOSA — Project Overview

_Source of truth untuk arsitektur dan konvensi SAMOSA. `CLAUDE.md` di root hanya penunjuk ke dokumen ini._

**Smart Aspiration Monitoring and Opinion Summarization Assistant**

_"Mengubah ratusan aspirasi menjadi insight yang mudah dipahami"_

---

## 1. Project Overview

### Gambaran besar

SAMOSA adalah platform berbasis AI untuk menganalisis feedback dan aspirasi terbuka (survey, evaluasi kegiatan, form kepuasan) menjadi laporan terstruktur yang siap dibaca oleh decision-maker. Positioning: **Report Automation Platform** — "dari data mentah ke laporan siap-print".

- **Target user:** organisasi, sekolah, OSIS, panitia event, tim HR
- **Input MVP:** CSV/Excel dari Google Forms
- **Input v1.1+:** Google Forms API (OAuth), form-builder internal
- **Output:** dashboard interaktif + laporan PDF/Excel exportable

### Project structure (ringkas)

```
samosa/
├── app/          → Next.js routing (pages + thin API handlers)
├── modules/      → Business logic (auth, ingestion, analysis, reporting)
├── components/   → UI components (shadcn + custom)
├── lib/          → Framework utils (supabase client, env, helpers)
├── types/        → Shared TS types (generated + domain)
├── supabase/     → Migrations, RLS policies, seed
├── tests/        → unit / integration / e2e
└── docs/         → ADR, research notes, prompt versions
```

### Tech stack

| Layer         | Tech                         | Rasional                                                  |
| ------------- | ---------------------------- | --------------------------------------------------------- |
| Framework     | Next.js 15 (App Router)      | React SSR/RSC, TS-first, single deploy                    |
| Language      | TypeScript strict            | Type safety, portfolio-grade                              |
| Styling       | Tailwind CSS + shadcn/ui     | Utility-first, fully customizable                         |
| Charts        | Recharts / Tremor            | Dashboard-oriented                                        |
| Data fetching | TanStack Query               | Cache, retry, realtime state                              |
| Validation    | Zod                          | Schema-first DTO validation                               |
| Database      | Supabase (Postgres)          | Managed, RLS built-in, generous free tier                 |
| Auth          | Supabase Auth + Google OAuth | Siap untuk Google Forms API                               |
| Storage       | Supabase Storage             | Upload CSV/Excel                                          |
| AI Provider   | **OpenAI API**               | JSON mode / structured output, biaya per token kompetitif |
| Jobs          | Inngest atau Vercel cron     | Async LLM batch processing                                |
| Hosting       | Vercel                       | CI/CD dari GitHub, edge                                   |
| Monitoring    | Sentry + PostHog             | Error + product analytics                                 |
| Testing       | Vitest + Playwright          | Unit + E2E                                                |
| Package mgr   | pnpm                         | Fast, disk-efficient                                      |

### External APIs

- **OpenAI API** — analysis engine (sentiment, topic, keyword, summary)
- **Google Forms API v2** _(post-MVP)_ — pull responses via OAuth
- **Google Drive API** _(post-MVP)_ — export ke Docs/Sheets

### Core constraints

- **Performance:** batch 500 aspirasi ≤ 2 menit end-to-end
- **Cost:** target < Rp 500 per aspirasi (LLM cost)
- **Bahasa:** Indonesia primary, English secondary
- **Security:** data sensitif — RLS wajib, no PII di logs, encryption at rest
- **Simplicity:** single deployable unit untuk MVP, tanpa DevOps expertise
- **Portability:** semua data user harus bisa di-export (CSV, PDF)
- **Reproducibility:** setiap analysis result menyimpan prompt version (untuk paper)

### Version pins yang tidak boleh turun

- **`@supabase/ssr` ≥ 0.12** — versi 0.5.x mengimpor path internal yang sudah dihapus di `@supabase/supabase-js` 2.116+. Gejalanya senyap: semua query ter-type sebagai `never`, dan typecheck gagal dengan `Property 'x' does not exist on type 'never'`.

---

## 2. Tujuan Projek

### Tujuan produk

1. Mengurangi waktu analisis feedback dari berjam-jam manual → < 5 menit otomatis
2. Menghasilkan laporan terstruktur (sentiment, topik, insight) siap sajikan
3. Menjadi tool default untuk OSIS, panitia acara, dan HR di Indonesia

### Tujuan pengembangan

1. **MVP deployable dalam 8-10 minggu** — dapat digunakan real user
2. **Portfolio-grade code** — clean, tested, documented (untuk universitas & recruiter)
3. **Research foundation** — arsitektur mendukung eksperimen model & prompt (untuk paper)
4. **Scalable foundation** — dari 10 → 10.000 user tanpa rewrite total

---

## 3. Build & Development Commands

Prerequisites: **Node.js 20 LTS**, **pnpm 9+**, akses Supabase project.

```bash
# ─── Setup awal ────────────────────────────
pnpm install                    # Install dependencies
cp .env.example .env.local      # Copy env template, isi values
pnpm db:migrate                 # Apply Supabase migrations
pnpm db:seed                    # Seed development data

# ─── Development ───────────────────────────
pnpm dev                        # Next.js dev server (localhost:3000)
pnpm dev:supabase               # Local Supabase (opsional, requires Docker)

# ─── Quality checks ────────────────────────
pnpm typecheck                  # tsc --noEmit
pnpm lint                       # ESLint
pnpm lint:fix                   # Auto-fix
pnpm format                     # Prettier
pnpm check                      # Runs typecheck + lint + format:check

# ─── Testing ───────────────────────────────
pnpm test                       # Vitest watch mode
pnpm test:run                   # Vitest single run
pnpm test:e2e                   # Playwright E2E
pnpm test:coverage              # Coverage report

# ─── Database ──────────────────────────────
pnpm db:migrate:new <name>      # Create new migration
pnpm db:migrate                 # Apply pending migrations
pnpm db:reset                   # Reset local DB (dev only!)
pnpm db:types                   # Regenerate TS types from schema

# ─── Build & Deploy ────────────────────────
pnpm build                      # Production build
pnpm start                      # Run production build locally
pnpm analyze                    # Bundle size analysis

# ─── Utilities ─────────────────────────────
pnpm clean                      # Remove .next, cache
pnpm upgrade:check              # Check for dependency updates
```

Environment variables (`.env.local`) minimal:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_APP_URL=
SUPABASE_SERVICE_ROLE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=
WORKER_SECRET=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
SENTRY_DSN=
```

> **`pnpm build` membutuhkan env vars.** `lib/env.ts` memvalidasi saat module load (sesuai Security standards: crash on startup, bukan crash on first request), jadi build tanpa env akan gagal di tahap "Collecting page data". Di CI dan Vercel, set env vars sebagai secrets sebelum build. Ini disengaja — jangan "diperbaiki" dengan membuat validasi jadi lazy.

---

## 4. Code Architecture & Layout

### Folder structure (detail)

```
samosa/
├── app/                             # Routing & pages only — NO business logic
│   ├── (auth)/                      # Login, signup
│   ├── (dashboard)/                 # Authenticated app shell
│   │   ├── datasets/
│   │   ├── analysis/[id]/
│   │   └── reports/[id]/
│   └── api/                         # Route Handlers — thin controllers
│       ├── _lib/respond.ts          # success() / failure() helpers
│       ├── datasets/route.ts
│       ├── analysis/[id]/status/route.ts
│       ├── reports/[id]/route.ts
│       └── webhooks/
│
├── modules/                         # Business logic — the actual product
│   ├── auth/
│   │   ├── services/
│   │   ├── policies/
│   │   └── index.ts                 # ← Public API only
│   ├── ingestion/
│   │   ├── parsers/                 # CSV, Excel, Google Forms
│   │   ├── validators/
│   │   └── index.ts
│   ├── analysis/                    # ← The core AI pipeline
│   │   ├── services/
│   │   │   ├── orchestrator.ts
│   │   │   └── job-runner.ts
│   │   ├── adapters/                # LLM abstraction layer
│   │   │   ├── openai.ts
│   │   │   ├── local.ts             # Lexicon baseline; future: IndoBERT
│   │   │   └── types.ts
│   │   ├── prompts/                 # Versioned prompt templates
│   │   │   ├── sentiment.v1.ts
│   │   │   ├── topic.v1.ts
│   │   │   └── summary.v1.ts
│   │   ├── postprocess/
│   │   └── index.ts
│   ├── reporting/
│   │   ├── aggregators/
│   │   ├── exporters/               # PDF, CSV, PPT
│   │   └── index.ts
│   └── shared/                      # Cross-module utilities
│       ├── errors/
│       ├── logger/
│       └── result.ts                # Result<T, E> pattern
│
├── components/
│   ├── ui/                          # shadcn primitives (generated)
│   ├── charts/
│   ├── forms/
│   └── layout/
│
├── lib/                             # Framework-level, no business logic
│   ├── supabase/
│   │   ├── client.ts                # Browser client
│   │   ├── server.ts                # Server client
│   │   └── admin.ts                 # Service role — use carefully!
│   ├── env.ts                       # Zod-validated env vars
│   └── utils.ts
│
├── types/
│   ├── database.ts                  # Generated from Supabase schema
│   ├── domain.ts                    # Business types
│   └── api.ts                       # API contracts
│
├── supabase/
│   ├── migrations/                  # SQL migrations (schema + RLS + storage)
│   ├── seed.sql
│   └── policies/                    # Catatan & skrip verifikasi RLS
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
│
├── docs/
│   ├── adr/                         # Architecture Decision Records
│   └── research/                    # Paper research, prompt experiments
│
└── public/
```

### Module rules (WAJIB, non-negotiable)

1. **Modules never import from each other directly.** Semua akses lintas modul lewat `index.ts` public API. Di dalam modul sendiri, pakai **relative import** — inilah yang membuat aturan lint bisa membedakan akses lintas modul dari akses internal.

   ```ts
   // ✅ OK — lintas modul lewat public API
   import { runAnalysis } from '@/modules/analysis'
   // ✅ OK — internal modul, relative
   import { sanitizeResponseText } from '../postprocess/sanitize'
   // ❌ FORBIDDEN — deep import lintas modul
   import { createOpenAiAdapter } from '@/modules/analysis/adapters/openai'
   ```

2. **Modules never import from `app/`.** Dependency arah satu: `app/` → `modules/` → `lib/`.
3. **Route handlers are thin.** Validate input (Zod) → call service → format response. Zero business logic.
4. **Every LLM call goes through an adapter.** Tidak boleh `import OpenAI` di luar `modules/analysis/adapters/`.
5. **All DB access via Supabase client**, no raw SQL di app code (kecuali migrations).
6. **Server-only code stays server-only.** Gunakan `import 'server-only'` di file yang tidak boleh sampai ke client bundle.

Aturan 1, 2, dan 4 **dipaksakan ESLint** (`no-restricted-imports` di `.eslintrc.json`), bukan sekadar konvensi. `tests/` dikecualikan karena unit test memang menguji internal modul.

### Data flow (contoh: upload → analysis → report)

```
User uploads CSV
  → POST /api/datasets                     (Zod validate)
  → ingestion.uploadDataset()
  → save to Supabase Storage + insert DB row
  → POST /api/analysis                     (create job)
  → analysis.createJob()                   → return { job_id }, HTTP 202
  → [async worker picks up job]
  → analysis.runJob(job_id):
       - load responses dari DB
       - batch responses (30 per batch, konkurensi 4)
       - openai adapter untuk sentiment/topic/keyword/summary
       - save ke analysis_results table
  → Client polls /api/analysis/[id]/status atau subscribe Supabase realtime
  → Ketika done, client fetch /api/reports/[id]
  → reporting.buildReport() → aggregated view untuk dashboard
```

### Data model (skema utama)

```
organizations      — tenant root
  ↓
users              — anggota organisasi (via organization_members)
  ↓
datasets           — metadata upload (nama, source, size, uploader_id)
  ↓
responses          — raw aspirasi (dataset_id, text, respondent_meta)
  ↓
analysis_jobs      — job tracking (dataset_id, status, prompt_version)
  ↓
analysis_results   — per-response hasil (response_id, sentiment, topics[], keywords[])
  ↓
reports            — aggregated view (job_id, summary, insights, exported_at)
```

Semua tabel wajib punya **RLS policy** yang scope ke `organization_id`.

---

## 5. Coding & Git Guidelines

### Coding standards

- **TypeScript strict** — `strict: true`, no `any` tanpa komentar justifikasi
- **Naming:** `camelCase` untuk variables/functions, `PascalCase` untuk types/components/classes, `UPPER_SNAKE_CASE` untuk constants
- **File naming:** `kebab-case.ts` (contoh: `analysis-orchestrator.ts`)
- **Named exports** — hindari `export default` kecuali untuk Next.js pages/layouts
- **Function length:** target < 50 baris, ekstrak helper kalau lebih
- **Error handling:** `Result<T, E>` pattern untuk operasi yang bisa gagal, bukan throw sembarangan
- **Comments explain WHY, not WHAT.** Kode harus self-documenting untuk apa; komentar untuk kenapa
- **No magic numbers/strings** — extract ke `const` dengan nama bermakna

### Prompt engineering standards

- Semua prompt di `modules/analysis/prompts/` sebagai `.ts` files dengan **version suffix** (`.v1.ts`, `.v2.ts`)
- Setiap prompt punya: `SYSTEM`, `USER_TEMPLATE`, `EXAMPLES` (few-shot), `OUTPUT_SCHEMA` (Zod)
- Prompt terdaftar di `prompts/index.ts` (registry per versi) — menambah versi berarti menambah file **dan** entry registry
- Log prompt version + model id pada setiap `analysis_result` — untuk reproducibility research
- **Update version, jangan overwrite** — sejarah prompt penting untuk paper
- Output LLM selalu divalidasi ulang dengan Zod di adapter; model tetap bisa melanggar skema meski diminta JSON

### Testing standards

- Setiap function di `modules/*/services/` wajib punya unit test — target **80% coverage**
- Setiap API route punya integration test dengan mocked services
- Critical user flows punya E2E test — upload → analyze → view report
- LLM adapters di-mock di unit tests; ada satu **golden test** dengan real API (dijalankan manual sebelum release)
- Tes ditulis dalam bahasa Inggris untuk consistency dengan tooling
- Adapter leksikon lokal (`adapters/local.ts`) dipakai untuk tes offline sekaligus baseline non-LLM di paper

### Security standards

- Semua env vars divalidasi di `lib/env.ts` (Zod) — app crash on startup kalau ada yang missing
- **JANGAN pernah commit** `.env*` files (kecuali `.env.example` dengan dummy values)
- Semua tabel Supabase punya RLS policy — verify dengan test
- Input validation di setiap boundary: route → Zod, DB → typed queries
- Sanitize user input sebelum kirim ke LLM: max length check, strip control chars, prompt-injection guard
- Log tidak boleh berisi PII — gunakan request ID untuk correlation
- Service role key HANYA di server, di file yang punya `import 'server-only'`

### Git workflow

- **Model:** trunk-based, feature branches short-lived (< 3 hari)
- **Branch naming:**
  - `feat/<scope>-<desc>` — new feature
  - `fix/<scope>-<desc>` — bug fix
  - `refactor/<scope>-<desc>` — refactor tanpa perubahan behavior
  - `chore/<desc>` — tooling, deps, config
  - `docs/<desc>` — documentation only
  - Contoh: `feat/analysis-sentiment-adapter`, `fix/ingestion-csv-encoding`

- **Commit convention:** [Conventional Commits](https://www.conventionalcommits.org/)

  ```
  feat(analysis): add sentiment adapter for OpenAI
  fix(ingestion): handle BOM in CSV files
  refactor(reporting): extract PDF exporter
  docs(readme): update setup instructions
  test(analysis): add orchestrator unit tests
  chore(deps): bump next to 15.2
  ```

- **Commit messages:** imperative present tense, subject ≤ 72 chars, body untuk WHY (bukan WHAT)

- **PR requirements:**
  - Linked issue atau ADR (untuk perubahan arsitektural)
  - CI passing (lint + typecheck + test)
  - Screenshot/video untuk perubahan UI
  - Deskripsi: **What / Why / How to test**

- **Merge strategy:** **squash & merge** ke `main`

- **Protected branches:** `main` — no direct push, PR required

- **NEVER commit:** secrets, `.env*` (kecuali `.env.example`), `node_modules`, `.next`, `.DS_Store`, generated files kecuali `types/database.ts`

### Definition of Done

Sebuah task dianggap selesai HANYA jika semua terpenuhi:

1. ✅ Kode diimplementasi sesuai acceptance criteria
2. ✅ Unit test ditulis dan passing
3. ✅ `pnpm check` clean (typecheck + lint + format)
4. ✅ Manual QA di dev environment
5. ✅ Documentation di-update (kalau public API/env berubah)
6. ✅ ADR ditulis (kalau ada keputusan arsitektural)
7. ✅ PR di-review minimal 1 orang (atau self-review checklist untuk solo work)
8. ✅ Merged ke `main`, deployed ke staging, smoke-tested

### Architecture Decision Records (ADR)

Setiap keputusan arsitektural besar (pilihan library, perubahan struktur, tradeoff signifikan) ditulis di `docs/adr/NNNN-title.md`:

```markdown
# NNNN. Title

- **Status:** Proposed | Accepted | Superseded by ADR-XXXX
- **Date:** YYYY-MM-DD

## Context

Apa masalahnya, apa yang mendorong keputusan ini.

## Decision

Apa yang diputuskan.

## Consequences

Dampak positif dan negatif dari keputusan ini.

## Alternatives considered

Opsi lain yang dipertimbangkan dan alasan tidak dipilih.
```

ADR adalah bukti _engineering thinking_ — sangat berharga untuk portfolio universitas.

---

## 6. Security Checklist

Status tiap item menandai apa yang sudah ada di kode vs. apa yang masih harus dikerjakan.

- ✅ **RLS di semua tabel Supabase** — user hanya bisa baca data milik organisasinya. Policy memfilter lewat `public.current_org_ids()` / `public.has_org_role()`.
- ✅ **API key lewat environment variables** — tidak pernah masuk Git (`.env.local` ada di `.gitignore`; gunakan Vercel env vars di production).
- ✅ **Sanitize input sebelum ke LLM** — validasi panjang, strip control chars, defang delimiter prompt, dan flag frasa prompt-injection (`modules/analysis/postprocess/sanitize.ts`).
- ⬜ **Rate limiting di endpoint upload dan analysis** — belum diimplementasi. Rencana: Upstash Redis (punya free tier untuk ini).
- ⬜ **PII handling** — belum diimplementasi. Rencana: opsi anonymize (hapus nama, email) sebelum data disimpan atau dikirim ke LLM. Saat ini `respondent_meta` disimpan apa adanya dan **tidak** ikut dikirim ke LLM.

---

_Dokumen ini adalah source of truth untuk arsitektur dan konvensi SAMOSA. Update lewat PR ke `docs/`. Version-controlled bersama codebase._

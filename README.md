# SAMOSA

**Smart Aspiration Monitoring and Opinion Summarization Assistant**

_"Mengubah ratusan aspirasi menjadi insight yang mudah dipahami"_

Platform berbasis AI yang mengubah feedback dan aspirasi terbuka (survey,
evaluasi kegiatan, form kepuasan) menjadi laporan terstruktur siap baca:
sentimen, topik, kata kunci, dan insight — dari CSV mentah ke laporan
siap-print.

## Prerequisites

- Node.js 20 LTS
- pnpm 9+ (`corepack enable pnpm`)
- Akses ke sebuah project Supabase (atau Docker untuk Supabase lokal)
- OpenAI API key

## Setup

```bash
pnpm install
cp .env.example .env.local   # isi nilainya
pnpm db:migrate
pnpm db:seed
pnpm dev                     # http://localhost:3000
```

## Perintah harian

| Perintah             | Kegunaan                                   |
| -------------------- | ------------------------------------------ |
| `pnpm dev`           | Dev server                                 |
| `pnpm check`         | typecheck + lint + format:check            |
| `pnpm test`          | Vitest watch                               |
| `pnpm test:run`      | Vitest sekali jalan                        |
| `pnpm test:coverage` | Coverage (target 80%)                      |
| `pnpm test:e2e`      | Playwright                                 |
| `pnpm db:types`      | Regenerate `types/database.ts` dari schema |
| `pnpm build`         | Production build                           |

## Struktur

```
app/         Routing + thin route handlers (tanpa business logic)
modules/     Business logic: auth, ingestion, analysis, reporting, shared
components/  UI (shadcn primitives + chart/form/layout)
lib/         Supabase client, env (Zod), utils
types/       Tipe database (generated), domain, kontrak API
supabase/    Migrations, RLS policies, seed
tests/       unit / integration / e2e
docs/        ADR + catatan riset
```

Aturan dependensi satu arah: `app/` → `modules/` → `lib/`. Akses lintas modul
hanya lewat `index.ts` masing-masing modul; ESLint memaksakan ini lewat
`no-restricted-imports`.

## Alur data

```
Upload CSV → POST /api/datasets → ingestion.uploadDataset()
  → POST /api/analysis → analysis.createJob() → { jobId } (202)
  → worker: POST /api/webhooks/inngest → analysis.runJob()
      parse → batch 30 → adapter LLM → analysis_results
  → client polling GET /api/analysis/[id]/status
  → GET /api/reports/[id] → reporting.buildReport()
```

## Catatan penting

- **Prompt versioning.** Prompt tidak pernah ditimpa. Perubahan = file `.vN`
  baru di `modules/analysis/prompts/` + entry di registry. Setiap
  `analysis_result` menyimpan `prompt_version` dan `model_id` demi
  reproducibility riset.
- **LLM adapter.** `openai` hanya boleh diimpor di
  `modules/analysis/adapters/`. Ada adapter leksikon lokal untuk tes offline dan
  sebagai baseline non-LLM.
- **Keamanan.** Semua tabel punya RLS yang di-scope ke `organization_id`.
  Service-role key hanya dipakai di file bertanda `import 'server-only'`. Log
  tidak pernah memuat teks responden.
- **Env.** Divalidasi Zod di `lib/env.ts`; konfigurasi yang kurang membuat app
  gagal saat startup, bukan saat request pertama.

## Dokumentasi

| Dokumen                                  | Isi                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------- |
| **[docs/OVERVIEW.md](docs/OVERVIEW.md)** | **Source of truth** — arsitektur, tech stack, data model, konvensi, DoD |
| [CLAUDE.md](CLAUDE.md)                   | Penunjuk ringkas untuk sesi Claude Code                                 |
| [docs/adr/](docs/adr/)                   | Architecture Decision Records                                           |
| [docs/research/](docs/research/)         | Catatan eksperimen prompt & model untuk paper                           |

### Architecture Decision Records

| #                                               | Judul                          | Status   |
| ----------------------------------------------- | ------------------------------ | -------- |
| [0001](docs/adr/0001-nextjs-supabase-stack.md)  | Next.js 15 + Supabase stack    | Accepted |
| [0002](docs/adr/0002-modular-monolith.md)       | Modular monolith               | Accepted |
| [0003](docs/adr/0003-async-analysis-jobs.md)    | Async analysis via queued jobs | Accepted |
| [0004](docs/adr/0004-pdf-rendering.md)          | PDF rendering approach         | Proposed |
| [0005](docs/adr/0005-openai-as-llm-provider.md) | OpenAI sebagai LLM provider    | Accepted |

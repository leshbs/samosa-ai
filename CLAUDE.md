# SAMOSA — Claude Code guide

**Smart Aspiration Monitoring and Opinion Summarization Assistant**

> **Source of truth: [`docs/OVERVIEW.md`](docs/OVERVIEW.md).**
> Arsitektur lengkap, tech stack, data model, folder structure, coding standards,
> git workflow, Definition of Done, dan security checklist ada di sana. Baca
> dokumen itu sebelum mengerjakan perubahan non-trivial, dan **update di sana**
> (lewat PR) — bukan di file ini.

File ini hanya memuat hal-hal yang paling sering dibutuhkan per sesi.

---

## Perintah yang paling sering dipakai

```bash
pnpm dev         # dev server di localhost:3000
pnpm check       # typecheck + lint + format:check — wajib clean sebelum commit
pnpm test:run    # unit + integration test sekali jalan
pnpm test:e2e    # Playwright
pnpm db:types    # regenerate types/database.ts dari schema Supabase
```

`pnpm build` **membutuhkan env vars** karena `lib/env.ts` memvalidasi saat module
load. Ini disengaja (crash on startup, bukan crash on first request) — jangan
"diperbaiki" dengan membuat validasi jadi lazy.

---

## Aturan yang tidak bisa ditawar

1. **Batas modul.** Akses lintas modul hanya lewat public API (`@/modules/<nama>`).
   Di dalam modul sendiri pakai relative import. Deep import lintas modul dilarang.
2. **Arah dependensi satu jalur:** `app/` → `modules/` → `lib/`. Modul tidak
   pernah mengimpor dari `app/`.
3. **Route handler tipis.** Validasi Zod → panggil service → format response.
   Nol business logic.
4. **Semua panggilan LLM lewat adapter.** `import OpenAI` hanya boleh di
   `modules/analysis/adapters/`.
5. **Server-only tetap server-only.** Pakai `import 'server-only'`; service-role
   key tidak boleh menyentuh client bundle.
6. **Prompt di-version, tidak pernah ditimpa.** Perubahan berarti file `.vN` baru
   plus entry di `prompts/index.ts`. Reproducibility riset bergantung pada ini.
7. **`Result<T, E>`**, bukan throw sembarangan, untuk operasi yang bisa gagal.
8. **Tanpa `any`** kecuali ada komentar justifikasi.

Aturan 1, 2, 4, dan 8 dipaksakan ESLint — kalau lint gagal, itu bukan false
positive, itu memang batas arsitekturnya.

---

## Peta cepat

| Butuh apa                 | Lihat di mana                                         |
| ------------------------- | ----------------------------------------------------- |
| Pipeline AI inti          | `modules/analysis/` (orchestrator, adapters, prompts) |
| Parsing CSV/Excel         | `modules/ingestion/`                                  |
| Agregasi & export laporan | `modules/reporting/`                                  |
| Session & permission      | `modules/auth/`                                       |
| `Result`, error, logger   | `modules/shared/`                                     |
| Schema, RLS, seed         | `supabase/migrations/`                                |
| Keputusan arsitektur      | `docs/adr/`                                           |

---

## Sebelum menyatakan selesai

Definition of Done lengkap ada di [`docs/OVERVIEW.md`](docs/OVERVIEW.md) bagian 5.
Minimal: kode sesuai acceptance criteria, unit test ditulis dan passing,
`pnpm check` clean, dokumentasi diupdate kalau public API atau env berubah, dan
ADR ditulis kalau ada keputusan arsitektural.

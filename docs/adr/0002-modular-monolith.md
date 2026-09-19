# 0002. Modular monolith on Next.js App Router

- **Status:** Accepted
- **Date:** 2026-09-19

## Context

SAMOSA harus deployable dalam 8-10 minggu oleh tim kecil tanpa DevOps expertise,
tapi arsitekturnya harus bertahan dari 10 ke 10.000 user. Pilihannya antara
microservices sejak awal, backend terpisah (Nest/FastAPI) + frontend, atau satu
unit deployable.

## Decision

Satu Next.js app sebagai modular monolith. Business logic hidup di `modules/`
dengan boundary yang dipaksakan lewat `index.ts` public API dan aturan
`no-restricted-imports` di ESLint. `app/` hanya routing dan thin controllers.

## Consequences

- (+) Satu deploy, satu CI, satu bahasa — velocity maksimal untuk MVP.
- (+) Boundary modul sudah jelas, jadi ekstraksi ke service terpisah nanti
  (kandidat pertama: `analysis`) hanya perlu memindahkan folder, bukan rewrite.
- (-) Semua beban jalan di satu runtime; job LLM yang berat harus dipindah ke
  worker terpisah (lihat ADR-0003) agar tidak menahan request.
- (-) Boundary dijaga lint, bukan compiler — butuh disiplin review.

## Alternatives considered

- **Microservices sejak awal** — ditolak: overhead operasional tidak sebanding
  untuk tim kecil dan traffic MVP.
- **Backend terpisah (FastAPI)** — ditolak: dua bahasa, dua deploy, dan duplikasi
  tipe DTO untuk keuntungan yang belum dibutuhkan.

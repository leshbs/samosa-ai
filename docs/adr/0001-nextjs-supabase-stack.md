# 0001. Next.js 15 + Supabase sebagai stack dasar

- **Status:** Accepted
- **Date:** 2026-09-19

## Context

SAMOSA harus jadi MVP deployable dalam 8-10 minggu, dikerjakan tim kecil tanpa
DevOps expertise, tapi tetap portfolio-grade dan sanggup tumbuh dari 10 ke
10.000 user. Kebutuhan konkretnya:

- Dashboard interaktif + halaman laporan yang bisa di-print → butuh rendering
  server-side yang baik dan SEO-friendly landing page.
- Multi-tenant dengan data sensitif → butuh isolasi per organisasi yang tidak
  bergantung pada kedisiplinan developer menulis `WHERE organization_id = ...`
  di setiap query.
- Upload file, auth, dan storage → tidak ingin membangun tiga subsistem sendiri.
- Job LLM asinkron berdurasi menit.
- Anggaran mendekati nol selama masa pengembangan.

## Decision

Next.js 15 (App Router) + TypeScript strict sebagai satu-satunya aplikasi, di
atas Supabase (Postgres + Auth + Storage), dideploy ke Vercel.

Pendukung: Tailwind CSS + shadcn/ui (UI), TanStack Query (state server),
Zod (validasi di semua boundary), Recharts (chart), Vitest + Playwright (test),
pnpm (package manager).

Keputusan turunan yang dicatat terpisah: pembagian modul (ADR-0002), eksekusi
job asinkron (ADR-0003), dan pemilihan LLM provider (ADR-0005).

## Consequences

- (+) Satu bahasa dan satu deploy dari landing page sampai worker; tipe DTO
  tidak perlu diduplikasi antara frontend dan backend.
- (+) **RLS Postgres jadi batas keamanan utama**, ditegakkan database, bukan
  kode aplikasi. Query yang lupa filter organisasi tetap aman selama memakai
  client milik user. Ini alasan terkuat memilih Supabase dibanding ORM biasa.
- (+) Auth, Storage, dan Google OAuth datang sekaligus — OAuth-nya juga modal
  untuk integrasi Google Forms API di v1.1.
- (+) Free tier Supabase + Vercel cukup untuk seluruh masa pengembangan.
- (-) **Vendor lock-in sedang.** Postgres-nya portabel, tapi RLS policy, Auth,
  dan Storage adalah API Supabase. Pindah provider berarti menulis ulang lapisan
  auth dan storage.
- (-) Serverless Vercel punya batas durasi eksekusi, jadi analisis batch tidak
  bisa jalan di request handler biasa — ini yang memaksa ADR-0003.
- (-) Service-role key membypass RLS sepenuhnya. Setiap pemakaiannya harus
  berada di file bertanda `import 'server-only'` dan sudah lewat pengecekan
  permission di modul auth.
- (-) App Router masih bergerak cepat; pola RSC/Server Action dapat berubah
  antar minor version.

## Alternatives considered

- **Next.js + Prisma + Postgres mandiri (Neon/Railway)** — ditolak: kontrol
  skema lebih baik, tapi auth, storage, dan row-level security harus dibangun
  sendiri. Isolasi tenant jadi tanggung jawab kode aplikasi, yang merupakan
  risiko keamanan terbesar produk ini.
- **T3 stack (Next.js + tRPC + Prisma)** — ditolak: tRPC memberi type-safety
  ujung ke ujung, tapi Route Handler + Zod sudah cukup untuk permukaan API
  sekecil ini, dan menambah tRPC berarti menambah konsep yang harus dipelajari
  tanpa keuntungan sepadan.
- **Backend terpisah (FastAPI/Django) + frontend Next.js** — ditolak: ekosistem
  NLP Python menarik untuk rencana IndoBERT, tapi dua bahasa, dua deploy, dan
  duplikasi tipe memperlambat MVP. Kalau nanti butuh model lokal, jalurnya lewat
  `LlmAdapter` yang memanggil service inference terpisah, bukan memindahkan
  seluruh backend.
- **Firebase** — ditolak: model data dokumen menyulitkan agregasi laporan
  (hitung distribusi sentimen, kelompokkan topik) yang di Postgres cukup satu
  query SQL.

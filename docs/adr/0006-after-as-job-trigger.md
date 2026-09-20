# 0006. `after()` sebagai pemicu job analisis

- **Status:** Accepted
- **Date:** 2026-09-20
- **Amends:** [0003](0003-async-analysis-jobs.md)

## Context

ADR-0003 memutuskan job analisis berjalan asinkron: `POST /api/analysis` membuat
baris `analysis_jobs` lalu mengembalikan 202, dan worker terpisah yang
mengeksekusinya. Keputusan itu menyisakan satu lubang — konsekuensinya menyebut
"butuh Inngest atau Vercel cron", tapi tidak ada yang benar-benar memanggil
`POST /api/webhooks/inngest`. Job dibuat, lalu diam di status `queued`
selamanya.

Tiga opsi dipertimbangkan untuk menutup lubang itu.

## Decision

Route handler memanggil `after()` dari `next/server`. Response 202 dikirim lebih
dulu, lalu `runJob()` berjalan di invocation yang sama setelah response tertutup.

`maxDuration = 300` pada route memberi ruang untuk dataset besar. Webhook worker
tetap ada dan tetap terlindungi shared secret, supaya pemindahan ke queue
sungguhan nanti tidak mengubah modul analisis sama sekali.

## Consequences

- (+) Tanpa infrastruktur baru, tanpa pipeline deploy kedua, tanpa dependensi
  tambahan. Satu implementasi pipeline analisis, sesuai aturan 4 dan 6 di
  CLAUDE.md.
- (+) Client tetap cepat: 202 dikirim sebelum pekerjaan dimulai.
- (-) Eksekusi terikat pada batas durasi function. Dataset yang melewati batas
  akan terpotong di tengah jalan; job tercatat `running` tanpa pernah selesai.
- (-) Tidak ada retry otomatis di level job. Kegagalan batch sudah ditangani
  adapter, tapi invocation yang mati total meninggalkan job menggantung.
- (-) Skala terbatas pada satu invocation — tidak ada antrian, tidak ada
  backpressure kalau banyak job dimulai bersamaan.

Konsekuensi negatif di atas dapat diterima untuk MVP dan menjadi pemicu jelas
untuk pindah ke queue sungguhan: begitu ada dataset yang gagal karena timeout,
ADR ini diganti.

## Alternatives considered

- **Supabase Edge Function** — ditolak: runtime Deno berarti menulis ulang
  pemanggilan OpenAI, registry prompt, dan batching di luar `modules/analysis/`.
  Itu melanggar aturan 4 (semua panggilan LLM lewat satu adapter) dan aturan 6
  (prompt di-version di satu registry), serta membuat dua implementasi yang
  pasti berbeda seiring waktu.
- **Vercel Cron menarik job dari antrian** — ditolak untuk sekarang: paket Hobby
  hanya mengizinkan satu eksekusi cron per hari, jadi job akan menunggu berjam-jam.
  Opsi ini kembali masuk akal kalau proyek naik ke paket Pro.

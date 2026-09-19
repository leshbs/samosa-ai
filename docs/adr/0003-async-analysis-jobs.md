# 0003. Async analysis via queued jobs

- **Status:** Accepted
- **Date:** 2026-09-19

## Context

Constraint performa: 500 aspirasi selesai dalam <= 2 menit. Dengan batch 30 dan
konkurensi 4, satu job butuh ~1-2 menit — jauh melewati batas serverless
function default dan terlalu lama untuk ditunggu di satu HTTP request.

## Decision

`POST /api/analysis` hanya membuat baris `analysis_jobs` berstatus `queued` dan
mengembalikan `job_id` (202). Eksekusi dilakukan worker terpisah lewat
`POST /api/webhooks/inngest` yang memanggil `analysis.runJob()`. Client memantau
progres dengan polling `/api/analysis/[id]/status` (Supabase realtime menyusul).

## Consequences

- (+) Request user selalu cepat; kegagalan LLM tidak menggantung koneksi.
- (+) Status job tersimpan di DB, jadi refresh browser tidak kehilangan progres.
- (+) Retry dan rate limiting bisa ditangani di level worker.
- (-) Butuh komponen infrastruktur tambahan (Inngest atau Vercel cron).
- (-) Polling menambah request; perlu diganti realtime kalau job jadi panjang.

## Alternatives considered

- **Analisis sinkron di route handler** — ditolak: melewati batas durasi dan UX
  buruk untuk dataset besar.
- **Streaming response** — ditolak: progres hilang kalau koneksi putus, dan
  tidak menyelesaikan masalah retry.

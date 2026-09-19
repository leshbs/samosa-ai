# 0005. OpenAI sebagai LLM provider

- **Status:** Accepted
- **Date:** 2026-09-19

## Context

Versi awal CLAUDE.md tidak konsisten: tabel tech stack menyebut Claude API
(Anthropic) sementara bagian "External APIs" menyebut OpenAI API. Scaffold
pertama dibangun di atas Anthropic mengikuti tabel tech stack, sehingga dokumen
dan kode saling bertentangan.

Kebutuhan teknisnya sendiri netral terhadap vendor: analisis batch 30 aspirasi
per request, output JSON terstruktur yang divalidasi Zod, kualitas bahasa
Indonesia yang memadai, dan biaya di bawah Rp 500 per aspirasi.

## Decision

OpenAI API dipakai sebagai LLM provider, sesuai keputusan pemilik produk.
Kontradiksi di dokumen diselesaikan ke arah OpenAI di seluruh dokumen dan kode.

Implementasi:

- `modules/analysis/adapters/openai.ts` mengekspor `createOpenAiAdapter()` yang
  memenuhi interface `LlmAdapter`.
- Memakai Chat Completions dengan `response_format: { type: 'json_object' }`
  (JSON mode) dan `temperature: 0` agar hasil deterministik untuk riset.
- Model dipilih lewat env `OPENAI_MODEL`, default `gpt-4o-mini` — kelas biaya
  yang paling masuk akal untuk target Rp 500 per aspirasi.
- ESLint melarang `import OpenAI` di luar `modules/analysis/adapters/`.

## Consequences

- (+) Dokumen dan kode kembali menjadi satu sumber kebenaran.
- (+) JSON mode mengurangi kegagalan parse dibanding sekadar meminta JSON lewat
  instruksi prompt.
- (+) Prompt tidak berubah sama sekali — semuanya tetap `SYSTEM` + `USER_TEMPLATE`
  yang provider-agnostic, jadi hasil riset lama tetap bisa dibandingkan lewat
  kombinasi `prompt_version` + `model_id` yang tersimpan per baris.
- (-) JSON mode menjamin JSON yang valid secara sintaks, bukan yang sesuai
  skema. Validasi Zod di adapter tetap wajib dan tetap bisa gagal.
- (-) Kualitas bahasa Indonesia antar provider belum diukur di proyek ini.
  Perlu eksperimen berlabel manusia sebelum diklaim di paper.

## Alternatives considered

- **Claude API (Anthropic)** — kandidat awal di tabel tech stack. Ditolak karena
  pemilik produk memilih OpenAI; secara teknis tetap layak dan bisa ditambahkan
  kembali sebagai adapter kedua tanpa mengubah orchestrator.
- **Dual-provider sejak awal** — ditolak untuk MVP: menambah permukaan
  konfigurasi dan biaya pengujian tanpa kebutuhan produk yang jelas. Interface
  `LlmAdapter` sudah membuat ini murah dilakukan nanti kalau paper
  membutuhkan perbandingan antar model.

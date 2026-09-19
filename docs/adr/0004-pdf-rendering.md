# 0004. PDF rendering approach

- **Status:** Proposed
- **Date:** 2026-09-19

## Context

Output utama SAMOSA adalah "laporan siap-print". Export PDF harus memuat chart,
tabel topik, dan teks bahasa Indonesia dengan tipografi rapi. Kandidat: headless
Chromium (Puppeteer/Playwright) merender route React, atau library layout murni
JS (`@react-pdf/renderer`, `pdfmake`).

## Decision

Belum diputuskan. `modules/reporting/exporters/pdf-exporter.ts` sudah ada sebagai
stub dengan signature final supaya UI bisa dibangun paralel; implementasinya
menunggu ADR ini di-accept.

## Consequences

- (+) Public API reporting stabil lebih dulu; tidak ada rework di sisi UI.
- (-) Export PDF belum tersedia sampai keputusan diambil — CSV jadi jalur export
  sementara.

## Alternatives considered

- **Headless Chromium** — kualitas visual terbaik (pakai komponen dashboard yang
  sama), tapi berat di serverless dan cold start lambat.
- **@react-pdf/renderer** — ringan dan jalan di Node biasa, tapi chart harus
  digambar ulang dan tidak reuse komponen Recharts.

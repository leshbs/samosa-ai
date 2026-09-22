# 0004. PDF rendering approach

- **Status:** Accepted
- **Date:** 2026-09-22 (diusulkan 2026-09-19)

## Context

Output utama SAMOSA adalah "laporan siap-print". Export PDF harus memuat chart,
tabel topik, dan teks bahasa Indonesia dengan tipografi rapi. Kandidat: headless
Chromium (Puppeteer/Playwright) merender route React, atau library layout murni
JS (`@react-pdf/renderer`, `pdfmake`).

## Decision

Pakai **`@react-pdf/renderer`**. Dokumen disusun ulang sebagai primitif PDF di
`modules/reporting/exporters/pdf-exporter.tsx`, bukan screenshot halaman
dashboard.

Chart digambar dari angka agregat yang sama dengan yang dipakai halaman web:
bar horizontal sebagai `<View>` dengan lebar proporsional, dan stacked bar
diverging untuk sentimen. Warna diambil dari nilai light-theme di
`app/globals.css` sebagai hex literal — PDF tidak punya stylesheet dan kertas
selalu terang.

## Consequences

- (+) Jalan di Node function biasa. Tidak ada binary Chromium ~50MB, tidak ada
  cold start berdetik-detik, tidak ada route `/print` yang perlu auth sendiri.
- (+) Ukuran dokumen dibatasi jumlah topik, bukan jumlah respons: dataset 5.000
  baris menghasilkan halaman sebanyak dataset 50 baris. Karena itu tidak ada
  guard "dataset terlalu besar" — bentuk kegagalan yang butuh guard itu tidak
  ada di desain ini.
- (−) Chart digambar ulang, tidak reuse komponen Recharts. Dua tempat harus
  diubah kalau bentuk chart berubah. Trade-off ini diterima karena chart-nya
  bar sederhana.
- (−) Font bawaan Helvetica: cukup untuk bahasa Indonesia, tapi belum sesuai
  branding. Kalau nanti perlu font sendiri, daftarkan lewat `Font.register`.

## Alternatives considered

- **Headless Chromium** — kualitas visual terbaik (pakai komponen dashboard yang
  sama), tapi berat di serverless dan cold start lambat.
- **pdfmake** — mirip @react-pdf/renderer tapi layout-nya deklaratif JSON;
  komponen React lebih mudah dibaca dan ditest di codebase ini.

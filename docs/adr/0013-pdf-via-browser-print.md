# 0013. PDF dibuat browser dari halaman cetak

- **Status:** Accepted, diubah oleh [ADR-0014](0014-pdf-download-in-browser.md):
  "Unduh PDF" sekarang mengunduh file yang digambar browser; halaman cetak di
  bawah ini tetap ada sebagai "Cetak" dan sebagai fallback.
- **Date:** 2026-10-03
- **Menggantikan:** [ADR-0004](0004-pdf-rendering.md)

## Context

Di pilot 01, "Export PDF" di produksi menghasilkan file `pdf.json` berisi
halaman error, bukan PDF ([temuan §2.2](../research/pilot-01-findings.md)).
Route `/api/reports/[id]/pdf` merender seluruh laporan dengan
`@react-pdf/renderer` di dalam function Vercel, dan hampir pasti kena batas
waktu. Yang berfungsi justru tombol cetak browser.

Library itu juga menambah 2,5 MB ke setiap function yang menyentuh modul
`reporting` — termasuk halaman laporan dan route CSV yang tidak pernah membuat
PDF — dan sudah dua kali gagal diam-diam: reconciler-nya menuntut React 19
(ADR-0007), dan footer dengan nomor halaman tidak pernah tampil (DEBT).

## Decision

**Server tidak lagi membuat PDF.** Laporan siap cetak adalah halaman biasa di
`/reports/[id]/print` (route group `app/(print)`, tanpa sidebar), dan PDF-nya
dibuat browser lewat dialog cetak — "Simpan sebagai PDF" ada di setiap browser
desktop dan ponsel.

- "Unduh PDF" di header laporan membuka halaman itu dengan `?auto=1`, yang
  memanggil `window.print()` sekali setelah font termuat.
- Isi dokumen dari `ReportDocumentData` yang sama dengan sebelumnya
  (`app/api/_lib/report-data.ts`); `printableReport()` di
  `modules/reporting/exporters/report-document.ts` menerapkan setelan isi
  laporan organisasi dan batas panjangnya.
- Chart di halaman cetak adalah `<div>` berukuran, bukan Recharts: SVG beranimasi
  tercetak di frame mana pun ia sedang berada. Setiap chart punya angkanya.
- Kertas selalu terang: `.print-doc` mengunci token warna light-theme, jadi
  laporan yang dicetak dari dark mode tetap tinta di atas putih.
- Header berjalan lewat `<thead>` yang diulang browser di setiap halaman; nomor
  halaman lewat margin box `@page` (Chromium 131+).
- Logo organisasi disematkan sebagai `data:` URL, bukan signed URL: hasil cetak
  tidak boleh kedaluwarsa.
- Laporan yang diarsipkan retensi tetap bisa dicetak; Pengaturan → Data
  menautkan masing-masing. Karena itu arsip organisasi (`.zip`) tidak lagi
  memuat PDF — setiap laporan masuk sebagai CSV.

## Consequences

- (+) Nol biaya server dan nol timeout: ukuran laporan tidak lagi menyentuh
  function sama sekali. Function yang dulu membawa react-pdf turun dari 8,7 MB
  ke 4,7 MB jejak file.
- (+) Satu mode kegagalan hilang, dan PDF-nya persis halaman yang dilihat.
- (+) Nomor halaman akhirnya ada (di Chromium), dan font-nya font aplikasi,
  bukan Helvetica.
- (−) Hasilnya bergantung pada browser pembaca. Firefox dan Safari mencetak
  tanpa nomor halaman; header/footer bawaan browser (URL, tanggal) bisa ikut
  kalau pengguna tidak mematikannya di dialog cetak.
- (−) Tidak ada PDF yang bisa dibuat tanpa manusia di depan browser: arsip
  organisasi dan email tidak bisa melampirkan PDF. Kalau suatu saat dibutuhkan,
  itu alasan untuk layanan render terpisah, bukan untuk mengembalikan react-pdf
  ke function web.
- (−) Bundle JS halaman laporan tidak berubah (181 kB): react-pdf memang tidak
  pernah dikirim ke browser. Yang mengecil adalah function server.

## Alternatives considered

- **Memperbaiki route lama** (menaikkan `maxDuration`, memecah render) —
  menyelesaikan gejala, tetap membayar 2,5 MB di setiap function, dan
  mempertahankan dokumen kedua yang harus dijaga sama dengan halaman web.
- **Headless Chromium di server** — PDF identik tanpa bergantung browser
  pembaca, tapi binary ~50 MB dan cold start berdetik-detik di serverless; alasan
  ADR-0004 menolaknya masih berlaku.

# 0014. "Unduh PDF" digambar di browser

- **Status:** Accepted
- **Date:** 2026-10-03
- **Mengubah:** [ADR-0013](0013-pdf-via-browser-print.md) — halaman cetak tetap
  ada, tapi bukan lagi jalur utama ke PDF.

## Context

ADR-0013 memindahkan PDF dari server ke dialog cetak browser. Itu
menghilangkan timeout, tapi "Unduh PDF" sejak itu tidak mengunduh apa pun: ia
membuka dialog cetak, dan pengguna harus tahu memilih "Simpan sebagai PDF". Di
ponsel langkah itu paling tersembunyi, dan hasilnya bergantung pada setelan
dialog (margin, header bawaan browser).

Yang diminta: satu tekan, satu file di folder unduhan — tanpa mengembalikan
render di server, yang gagal di pilot 01.

## Decision

**Browser pembaca yang menggambar PDF-nya**, dengan `@react-pdf/renderer` yang
dimuat saat tombol ditekan.

- `GET /api/reports/[id]/document` mengembalikan `ReportPdfPayload`: isi
  laporan sebagai JSON, dengan setelan organisasi dan batas panjang sudah
  diterapkan di server (`reportPdfPayload()` di
  `modules/reporting/exporters/report-document.ts`). Bacaannya sama dengan
  halaman cetak, izinnya sama (`report:export`), dan laporan yang diarsipkan
  ikut — alasannya sama dengan ADR-0013.
- `components/reports/download-pdf-button.tsx` mengambil data itu dan
  `import()` kode gambarnya **bersamaan**, lalu menyerahkan `Blob` ke browser
  lewat `<a download>`.
- `components/reports/pdf/report-pdf.tsx` adalah layout kedua dari laporan yang
  sama; yang pertama `components/reports/print-document.tsx`. react-pdf tidak
  membaca HTML maupun CSS, jadi markup-nya tidak bisa dipakai bersama. Yang
  dipakai bersama adalah isinya: keduanya menata `printableReport()`.
- **Kalau gagal, pengguna tetap dapat PDF.** Kesalahan apa pun (browser lama,
  skrip diblokir, koneksi putus) membawa pengguna ke halaman cetak dengan dialog
  terbuka dan keterangan kenapa. Halaman cetak juga tetap dicapai lewat tombol
  "Cetak".
- Font aplikasi (Plus Jakarta Sans) disertakan sebagai tiga file TTF statis di
  `public/fonts/`, karena react-pdf tidak membaca woff2 variabel dari
  `next/font`.

### Empat hal yang hanya ketahuan dengan mengukur

1. **CSP.** Mesin layout react-pdf adalah modul WebAssembly. Di produksi
   `script-src` menolaknya; di dev tidak, karena dev punya `'unsafe-eval'`.
   `'wasm-unsafe-eval'` ditambahkan ke `script-src` di `middleware.ts`. Ia hanya
   mengizinkan kompilasi WebAssembly, bukan `eval()`. Cakupannya seluruh
   aplikasi, bukan hanya halaman laporan: CSP dokumen pertama ikut terbawa di
   setiap navigasi sisi klien.
2. **Ukuran function server.** Build server tetap mengikuti `import()` itu, dan
   file tracing memasukkan react-pdf ke function halaman laporan: 9,5 MB.
   `next.config.ts` menyuruh build server melewati `pdf/report-pdf`
   (`IgnorePlugin`); sesudahnya 5,4 MB. Alias ke paketnya tidak
   mempan — Next menjadikannya external lebih dulu.
3. **Nomor halaman.** `<Text fixed render>` yang diposisikan dengan `bottom`
   digambar di setiap halaman, ribuan point di atas kertas. Dengan `top`, ia
   muncul. Ini yang dulu dicatat DEBT sebagai "`render` tidak menghasilkan
   apa pun".
4. **Jarak antar-section.** react-pdf menghitung `marginBottom` sebuah blok
   sebagai bagian dari yang harus muat. Section yang berakhir dalam jarak
   margin-nya dari kaki halaman dipindah utuh ke halaman berikut. Jarak itu
   sekarang `gap` di `Page`.

### Yang tidak bisa digambar, dibuang

Satu typeface hanya menggambar karakter yang ia punya. Browser meminjam sisanya
dari sistem; react-pdf jatuh ke font bawaan dan mencetak emoji sebagai simbol
acak. `drawableReport()` menanyakan ke file font-nya sendiri
(`hasGlyphForCodePoint`) dan membuang karakter yang tidak ada. Logo digambar
ulang browser lewat canvas (`raster-logo.ts`), karena pembaca PNG react-pdf
lebih ketat daripada browser dan gagal tanpa pesan.

## Consequences

- (+) "Unduh PDF" benar-benar mengunduh, dengan nama file, margin, dan nomor
  halaman yang sama di semua browser.
- (+) Server tetap tidak merender apa pun: bagiannya satu bacaan data.
- (+) Function server tidak membawa react-pdf (diukur: 5,4 MB untuk halaman
  laporan, 4,7 MB untuk route).
- (−) **Dua layout untuk satu laporan.** Perubahan section harus dikerjakan di
  `print-document.tsx` dan `report-pdf.tsx`. Isinya tidak bisa menyimpang
  (keduanya membaca `printableReport()`), tampilannya bisa.
- (−) **Tekan pertama tidak instan.** Diukur di build produksi lokal dengan
  database hosted: desktop 3,6 detik lalu 1,6 detik; ponsel (CPU diperlambat
  4×) 5,0 detik lalu 3,3 detik. Sekitar 1,4–3 detik dari angka itu adalah
  bacaan data, yang juga dibayar halaman cetak. Tekan pertama mengunduh ±450 kB
  JavaScript dan ±180 kB font, sekali.
- (−) **PDF unduhan kehilangan emoji** dan teks di luar aksara Latin; halaman
  cetak tidak. Lihat DEBT.
- (−) CSP sedikit lebih longgar (`'wasm-unsafe-eval'`).
- (−) Di browser dalam-aplikasi (WhatsApp, Instagram) unduhan `blob:` bisa
  tidak terjadi tanpa error apa pun, sehingga fallback tidak terpicu. Tombol
  "Cetak" tetap ada untuk itu.

## Alternatives considered

- **Headless Chromium di server** — satu layout, PDF identik dengan halaman
  cetak, dan bisa dilampirkan ke email. Binary ±50 MB, cold start berdetik-detik,
  dan risiko batas waktu yang sama dengan yang gagal di pilot. Tetap jalur yang
  benar kalau suatu saat PDF harus dibuat tanpa manusia di depan browser.
- **Screenshot ke PDF (html2canvas + jsPDF)** — teks menjadi gambar: buram,
  tidak bisa dipilih atau dicari, dan file-nya besar.
- **Layanan PDF pihak ketiga** — mengirim jawaban siswa ke pemroses lain.
- **Web Worker untuk menggambar** — UI tetap responsif selama 2–4 detik di
  ponsel, tapi menambah satu bundel dan satu aturan CSP (`worker-src`). Ditunda
  sampai ada keluhan; tombolnya sudah menampilkan status.

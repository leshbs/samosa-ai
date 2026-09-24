# Fase 9 — catatan pengukuran

**Tanggal:** 2026-09-24
**Status pilot dengan pengguna nyata:** masih belum dilakukan.

Audit keamanan lengkap ada di [`docs/security-audit.md`](../security-audit.md).
Dokumen ini mencatat angka performa dan tiga kegagalan yang hanya terlihat
setelah aplikasinya benar-benar dibuka.

## Bundle

Diukur dari `pnpm build`, bukan ditaksir.

| Route           | Sebelum             | Sesudah                 |
| --------------- | ------------------- | ----------------------- |
| `/reports/[id]` | 109 kB / **327 kB** | 7,76 kB / **226 kB**    |
| `/login`        | 210 kB              | 210 kB (tidak disentuh) |
| shared          | 102 kB              | 102 kB                  |

Recharts beserta d3 adalah 109 kB dari 327 kB itu — satu-satunya hal terberat di
aplikasi, di halaman yang paling mungkin dibuka lewat jaringan sekolah.
`next/dynamic` dengan `ssr: false` memindahkannya ke chunk yang diambil setelah
mount.

**`ssr: false` di sini gratis.** Recharts menggambar lewat `ResponsiveContainer`,
yang mengukur parent-nya saat mount dan tidak merender apa pun di server — HTML
dari server memang tidak pernah berisi grafik. Yang berubah hanya _kapan_ kodenya
datang.

### Halaman login 210 kB

Belum dibayar, tapi sudah diukur. Chunk terbesarnya 245 kB mentah, dan `grep`
menemukan `GoTrueClient` **dan** `RealtimeClient` di dalamnya. Halaman login
membawa klien websocket yang tidak akan pernah dibukanya, karena
`@supabase/supabase-js` membundel keduanya jadi satu. Dicatat di `DEBT.md`.

## Lighthouse (mobile, landing page)

Dijalankan terhadap production build (`pnpm start`), bukan dev server, memakai
Chromium bawaan Playwright.

| Kategori       | Sebelum | Sesudah |
| -------------- | ------- | ------- |
| Performance    | 94      | **97**  |
| Accessibility  | 100     | **100** |
| Best practices | 96      | **100** |
| SEO            | 100     | **100** |

| Metrik                   | Nilai  |
| ------------------------ | ------ |
| First Contentful Paint   | 1,6 s  |
| Largest Contentful Paint | 2,3 s  |
| Total Blocking Time      | 130 ms |
| Cumulative Layout Shift  | **0**  |
| Speed Index              | 1,6 s  |

Yang memisahkan best-practices 96 dari 100 ternyata satu hal: **tidak ada
favicon sama sekali**, jadi setiap kali halaman dibuka ada 404 di console.
`app/icon.svg` menutupnya.

Satu audit tetap merah dan memang begitu adanya: `bf-cache`. Dokumen utamanya
`cache-control: no-store` karena root layout membaca `headers()` untuk nonce CSP,
dan halaman ber-`no-store` tidak boleh masuk back/forward cache. Itu harga yang
dipilih sadar.

## Tiga kegagalan yang hanya terlihat setelah dibuka

Pola yang sama dengan fase 7, jadi layak dicatat lagi.

### 1. CSP memblokir tema, diam-diam

Versi pertama CSP memblokir satu script inline di **setiap halaman**. Next.js
menandai script buatannya sendiri dengan nonce secara otomatis; yang tidak
ditandai adalah script `next-themes`, yang menetapkan kelas tema sebelum paint
pertama.

**Gejalanya kalau tidak dibuka di browser:** mode gelap diam-diam tidak jalan.
Tidak ada test yang gagal. Tidak ada build yang merah.

### 2. `upgrade-insecure-requests` mematikan navigasi di HTTP

Production build yang disajikan lewat HTTP biasa — `pnpm start` di localhost,
atau self-host di LAN — menulis ulang setiap navigasi same-origin jadi
`https://localhost` dan gagal dengan `ERR_SSL_PROTOCOL_ERROR`.

**Gejalanya:** tombol "Mulai analisis" yang tidak melakukan apa-apa. Tidak ada
satu pun pesan yang menyebut CSP. Sekarang direktifnya dikunci ke skema yang
benar-benar dipakai request, bukan ke `NODE_ENV`.

### 3. Probe RLS yang lulus karena tabelnya tidak ada

Versi pertama `scripts/check-rls.mjs` menanyakan apakah `rate_limits` bisa dibaca
user biasa, mendapat "tabel tidak ada", dan mencetak **PASS**.

Sekarang kasus seperti itu mencetak SKIP dan dihitung terpisah. Aturannya
sekarang tertulis di kepala `security-audit.md`: **kontrol yang tidak ada bukan
kontrol yang lulus.**

## Korelasi log

Diverifikasi end-to-end, bukan lewat test. Satu unduhan PDF:

```
x-request-id: e0af748517423f37
```

```json
{
  "level": "info",
  "message": "api.export.pdf.sent",
  "requestId": "e0af748517423f37",
  "route": "GET /api/reports/[id]/pdf",
  "jobId": "2d3b1562-...",
  "bytes": 10087
}
```

Byte yang dicatat sama dengan byte yang diterima browser.

Keputusan yang diambil setelah mengukur, bukan sebelum: header `x-request-id`
yang dipasang middleware di `NextResponse.next()` **ikut ke response yang dibuat
route handler sendiri**, termasuk 401. Jadi parameter `requestId` yang sempat
ditambahkan ke `failure()` dibuang lagi — satu mekanisme, dipasang di satu
tempat.

## Yang belum terjawab

Masih butuh orang, bukan test:

- Apakah pesan error dalam bahasa Indonesia benar-benar lebih membantu, atau
  justru menyulitkan saat mencari solusi online?
- Apakah pengurus OSIS membaca kebijakan privasi sebelum mengunggah aspirasi
  teman-temannya?
- Apakah batas 20 analisis/jam terasa membatasi pada hari pengumpulan aspirasi?

Angka di atas hanya bercerita soal byte dan milidetik.

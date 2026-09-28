# Audit keamanan

**Tanggal audit:** 2026-09-24
**Cakupan:** seluruh aplikasi pada commit fase 9.
**Metode:** setiap baris di bawah punya bukti — hasil probe, header yang
benar-benar terkirim, atau file yang bisa dibuka. Baris tanpa bukti ditandai
**belum diverifikasi**, bukan ✅.

> Satu aturan yang dipegang di dokumen ini: **kontrol yang tidak ada bukan
> kontrol yang lulus.** Versi pertama probe RLS menanyakan apakah tabel
> `rate_limits` bisa dibaca, mendapat jawaban "tabel tidak ada", dan mencetak
> PASS. Sekarang kasus seperti itu dicetak SKIP.

---

## 1. Isolasi antar-organisasi (RLS)

**Status: ✅ terverifikasi.**

Probe: [`scripts/check-rls.mjs`](../scripts/check-rls.mjs)

```bash
node --env-file=.env.local scripts/check-rls.mjs
```

Script membuat **dua organisasi lengkap** dengan satu user masing-masing —
dataset, respons, job, hasil analisis, dan laporan — lalu masuk sebagai user A
memakai **anon key** (kunci yang sama dengan yang dipakai browser) dan mencoba
menyentuh setiap baris milik user B. Semua tenant percobaan dihapus di `finally`,
termasuk ketika probe gagal.

Hasil terakhir: **14/14 lulus, 1 dilewati.**

| Cek                                                      | Hasil                           |
| -------------------------------------------------------- | ------------------------------- |
| User A bisa membaca dataset miliknya sendiri (kontrol)   | PASS                            |
| A tidak bisa membaca `organizations` milik B             | PASS                            |
| A tidak bisa membaca `organization_members` milik B      | PASS                            |
| A tidak bisa membaca `datasets` milik B                  | PASS                            |
| A tidak bisa membaca `responses` milik B                 | PASS                            |
| A tidak bisa membaca `analysis_jobs` milik B             | PASS                            |
| A tidak bisa membaca `analysis_results` milik B          | PASS                            |
| A tidak bisa membaca `reports` milik B                   | PASS                            |
| Listing dataset tanpa filter hanya berisi org A          | PASS                            |
| Listing respons tanpa filter hanya berisi org A          | PASS                            |
| A tidak bisa mengganti nama org B                        | PASS                            |
| A tidak bisa menyisipkan dataset ke org B                | PASS                            |
| A tidak bisa menghapus data org B                        | PASS                            |
| Pemanggil yang belum masuk tidak melihat dataset apa pun | PASS                            |
| `rate_limits` tidak terbaca user biasa                   | SKIP — migrasi belum diterapkan |

**Cek kontrol itu penting.** Tanpa baris pertama, seluruh tabel bisa hijau
hanya karena query-nya rusak.

**Catatan perilaku:** RLS **menyaring**, bukan menolak. Membaca data organisasi
lain mengembalikan `200` dengan nol baris, bukan `403`. Itu memang yang
diinginkan — tapi berarti kode aplikasi tidak boleh menyimpulkan "tidak ada
baris" sebagai "tidak ada datanya". Di `renameOrganization`, nol baris
diterjemahkan jadi `FORBIDDEN` justru karena ini.

**Utang yang masih terbuka:** `organizations_update` di RLS mengizinkan `owner`
dan `admin`, sedangkan `can(role, 'org:manage')` hanya `owner`. Route memakai
yang lebih ketat, jadi perilakunya benar hari ini. Dicatat di `DEBT.md`.

---

## 2. Rate limiting

**Status: 🟡 kode siap dan terbukti gagal-terbuka; migrasinya belum diterapkan.**

Implementasi: [`modules/security/services/rate-limit.ts`](../modules/security/services/rate-limit.ts)
plus migrasi `supabase/migrations/20260924000100_rate_limits.sql`.

| Endpoint                         | Batas    | Kenapa dibatasi                 |
| -------------------------------- | -------- | ------------------------------- |
| `POST /api/datasets/preview`     | 60 / jam | membaca seluruh file ke memori  |
| `POST /api/datasets`             | 30 / jam | menulis baris + objek storage   |
| `POST /api/analysis`             | 20 / jam | satu panggilan LLM per batch    |
| `POST /api/reports/[id]/summary` | 20 / jam | panggilan berbayar, satu tombol |

**Postgres, bukan Upstash.** Setiap request sudah membuka koneksi Supabase, jadi
ini menambah penghitung tanpa vendor kedua. Penghitung di dalam proses tidak
berguna di serverless: tiap cold start memberi jatah baru.

**Jendela tetap, bukan geser.** Lonjakan tepat di batas jendela bisa sebentar
mencapai dua kali limit. Itu diterima: alternatifnya satu baris per request,
yang membuat tabelnya tumbuh tanpa batas.

**Gagal terbuka, dan itu disengaja.** Kalau database tidak bisa dihubungi,
request tetap diteruskan dan `security.rate_limit.unavailable` dicatat. Limiter
yang gagal tertutup mengubah satu gangguan jadi gangguan kedua yang lebih besar.
**Terverifikasi:** dengan tabel belum ada, dua request menembus dan dua baris
log itu muncul — aplikasi tidak rusak.

> **Langkah yang tersisa (butuh akses manusia):** CLI Supabase tidak bisa
> menyambung tanpa password database, jadi `supabase/migrations/20260924000100_rate_limits.sql`
> **harus ditempel ke SQL Editor**. Migrasinya idempoten (`create table if not
exists`, `create or replace function`). Sesudah itu jalankan ulang
> `scripts/check-rls.mjs` — baris SKIP terakhir harus berubah jadi PASS.

---

## 3. CSRF

**Status: ✅ terverifikasi di browser sungguhan.**

Implementasi: [`lib/security/same-origin.ts`](../lib/security/same-origin.ts),
dipanggil dari `middleware.ts`.

Cookie auth Supabase sudah `SameSite=Lax`, yang menghentikan POST lintas situs
membawa cookie. Pengecekan `Origin` adalah **kunci kedua**: `Lax` adalah default
browser yang bisa diam-diam berubah oleh opsi cookie di kemudian hari.

Aturannya:

- Metode aman (`GET`, `HEAD`, `OPTIONS`) dilewati.
- `Origin` yang hilang pada metode tulis **ditolak**. Semua browser mengirimnya
  pada `fetch` dan form post, jadi ketiadaannya berarti klien non-browser.
- `/api/webhooks/*` dikecualikan: worker membuktikan diri dengan `WORKER_SECRET`,
  bukan dengan sesi.

Bukti (dev server, Playwright):

```
forged cross-site POST -> 403 {"error":{"code":"FORBIDDEN","message":"Permintaan lintas situs ditolak"}}
same-origin POST       -> 422 {"error":{"code":"VALIDATION","message":"File wajib dipilih"}}
```

Baris kedua penting: ia membuktikan penjaganya tidak memblokir semuanya.

---

## 4. Sanitasi unggahan file

**Status: ✅ terverifikasi lewat unit test.**

Implementasi: [`modules/ingestion/validators/file-signature.ts`](../modules/ingestion/validators/file-signature.ts),
dipanggil dari `previewDataset` **dan** `uploadDataset` — dua-duanya, karena
keduanya menerima file dari request.

| Lapisan         | Aturan                                                           |
| --------------- | ---------------------------------------------------------------- |
| Ukuran          | 10 MB (`MAX_UPLOAD_BYTES`), diperiksa sebelum file dibaca        |
| Ekstensi        | hanya `.csv`, `.xls`, `.xlsx`                                    |
| MIME            | whitelist longgar, karena browser tidak sepakat soal CSV         |
| **Magic bytes** | PDF/ELF/EXE/PNG/JPEG/GIF/GZIP/RAR/7Z ditolak apa pun ekstensinya |
| **Magic bytes** | `xlsx` wajib ZIP (`PK\x03\x04`) atau OLE2 (`\xD0\xCF\x11\xE0`)   |
| **Magic bytes** | `csv` menolak ZIP/OLE2 dan menolak byte NUL (biner dan UTF-16)   |
| Jumlah baris    | maksimum 5.000 aspirasi per dataset                              |
| Panjang teks    | 4.000 karakter per aspirasi, dipotong                            |

**Kenapa magic bytes wajib:** `source` (`csv` atau `xlsx`) datang dari **body
request**, bukan dari file. Tanpa pengecekan ini, PDF yang dikirim dengan
`source=csv` sampai ke parser.

**Batasnya 10 MB, bukan 5 MB seperti di checklist.** 5.000 aspirasi × 4.000
karakter sudah melebihi 5 MB sebelum kolom metadata dihitung, jadi batas 5 MB
akan menolak dataset yang sah. Batas jumlah baris yang jadi penjaga sebenarnya.

**Catatan:** file UTF-16 dengan nama `.csv` sekarang **ditolak dengan pesan
jelas**. Sebelumnya file itu diterima dan diubah jadi mojibake tanpa peringatan.

---

## 5. Audit `console.log` / PII di log

**Status: ✅ terverifikasi.**

```bash
grep -rn "console\.\(log\|warn\|error\|info\|debug\)" app modules lib components
```

Hasil: **tiga baris, semuanya di dalam `modules/shared/logger/logger.ts`.** Tidak
ada `console.*` liar di seluruh kode aplikasi. Satu-satunya tambahan yang
disengaja adalah `console.error` di error boundary, yang hanya mencetak `digest`
— boundary berjalan di browser, tempat logger terstruktur tidak punya tujuan.

Yang **tidak pernah** masuk log, diperiksa satu per satu:

- Teks aspirasi (`responses.text`) — tidak ada satu pun pemanggilan logger yang
  menerimanya.
- `respondent_meta` — nama dan kelas responden dari Google Forms.
- Email atau nama pengguna.
- Isi ringkasan yang dihasilkan model.

Yang masuk log hanya id, jumlah, kode error, versi prompt, dan biaya. `AppError`
punya field `cause` yang sengaja **tidak** ikut ke respons API (lihat
`app/api/_lib/respond.ts`) karena bisa membawa payload upstream.

---

## 6. Audit environment variable

**Status: ✅ terverifikasi.**

- `SUPABASE_SERVICE_ROLE_KEY` dibaca **hanya** di `lib/supabase/admin.ts`, dan
  file itu diawali `import 'server-only'` — mengimpornya dari komponen client
  menggagalkan build, bukan membocorkan kunci saat runtime.
- `serverEnv()` melempar error kalau `typeof window !== 'undefined'`.
- Hanya variabel `NEXT_PUBLIC_*` yang di-inline ke bundle client, dan ketiganya
  (URL Supabase, anon key, URL app) memang publik.
- `.env.local` ada di `.gitignore`; yang di-commit hanya `.env.example` berisi
  placeholder.
- Validasi env berjalan saat module load, jadi deployment yang salah konfigurasi
  gagal saat start, bukan saat request pertama.

Verifikasi bundle client — mencari **nilainya**, bukan namanya:

```bash
grep -rlF -- "$SUPABASE_SERVICE_ROLE_KEY" .next/static/   # 0 file
grep -rlF -- "$OPENAI_API_KEY"            .next/static/   # 0 file
grep -rlF -- "$WORKER_SECRET"             .next/static/   # 0 file
```

**Temuan kecil, dicatat apa adanya.** Mencari _nama_-nya memberi hasil berbeda:
`SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, dan `WORKER_SECRET` muncul di tiga
chunk client. Penyebabnya `lib/env.ts` diimpor komponen client untuk `clientEnv`,
dan bundler ikut membawa definisi `serverSchema` di file yang sama — yang isinya
hanya daftar nama field Zod.

Yang bocor adalah **daftar nama variabel**, yang sudah ada di `.env.example` di
repo publik. Nilainya tidak ikut: Next hanya meng-inline `NEXT_PUBLIC_*`.
Dampaknya nol, tapi dicatat karena perbedaan antara "namanya ada" dan "nilainya
ada" persis jenis hal yang membuat audit sekilas mengira ada kebocoran.

---

## 7. Content Security Policy

**Status: ✅ terverifikasi di browser, nol pelanggaran.**

Implementasi: `middleware.ts` (CSP, karena nonce-nya per request) dan
`next.config.ts` (header konstan, supaya ikut menutup path yang dilewati
matcher middleware).

```
default-src 'self';
script-src 'self' 'nonce-<per request>' 'strict-dynamic';
style-src 'self' 'unsafe-inline';
img-src 'self' data: blob:;
font-src 'self' data:;
connect-src 'self' https://<project>.supabase.co wss://<project>.supabase.co;
frame-ancestors 'none'; frame-src 'none'; object-src 'none';
base-uri 'self'; form-action 'self'; upgrade-insecure-requests
```

Ditambah header konstan: `X-Frame-Options: DENY`, `X-Content-Type-Options:
nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
`Permissions-Policy` (kamera/mikrofon/lokasi dimatikan), dan
`Strict-Transport-Security`.

**Apa yang ditemukan saat mengukur, bukan saat menebak.** Versi pertama CSP
memblokir satu script inline di **setiap halaman**. Next.js menandai script
buatannya sendiri dengan nonce secara otomatis; yang tidak ditandai adalah
script `next-themes`, yang menetapkan kelas tema sebelum paint pertama. Kalau
CSP ini dipasang tanpa dibuka di browser, gejalanya adalah mode gelap yang diam-
diam tidak jalan. Nonce sekarang diteruskan dari middleware → `headers()` →
`ThemeProvider`.

**Harganya:** membaca `headers()` di root layout membuat semua route jadi
dinamis. Dianggap sepadan — halaman aplikasi ada di balik sesi dan memang tidak
bisa di-cache, dan satu-satunya halaman statis adalah landing tanpa data.

`style-src` tetap memakai `unsafe-inline`: Radix menulis inline style saat
runtime untuk memosisikan popover, dan tidak ada nonce untuk itu. Inline style
tidak bisa mengeksekusi script, jadi biayanya jauh lebih kecil daripada padanan
`script-src`.

Bukti (Playwright, dev server, console diawasi):

| Halaman         | Pelanggaran CSP                                            |
| --------------- | ---------------------------------------------------------- |
| `/`             | tidak ada                                                  |
| `/login`        | tidak ada                                                  |
| `/dashboard`    | tidak ada                                                  |
| `/datasets`     | tidak ada                                                  |
| `/settings`     | tidak ada                                                  |
| `/reports/[id]` | tidak ada — 5 grafik tampil, websocket realtime tersambung |

Baris terakhir yang paling berarti: ia membuktikan `connect-src` mengizinkan
`wss:` untuk Supabase Realtime. Tanpa itu, halaman laporan berhenti memperbarui
diri tanpa pesan error apa pun.

---

## 8. Permukaan XSS

**Status: ✅ ditinjau.**

- `grep -rn "dangerouslySetInnerHTML" app components modules` → **tidak ada**.
- Teks aspirasi dari pengguna selalu dirender sebagai text node React, yang
  meng-escape secara default.
- Export CSV diawali BOM UTF-8 dan dikirim dengan `X-Content-Type-Options:
nosniff` plus `content-disposition: attachment`, jadi tidak bisa ditafsirkan
  ulang sebagai HTML oleh browser.

**Belum ditangani:** CSV injection (sel yang diawali `=`, `+`, `-`, `@` yang
dieksekusi Excel sebagai formula). Aspirasi yang diawali `=` akan tersimpan apa
adanya di file export. Dicatat di `DEBT.md`.

---

## 9. Yang tidak diaudit

Jujur soal batas audit ini:

- **Belum ada pengujian penetrasi oleh orang lain.** Semua di atas ditulis dan
  diverifikasi oleh pihak yang sama yang menulis kodenya.
- **Belum ada audit dependensi terjadwal.** `pnpm audit` belum jadi bagian CI.
- **Belum ada rotasi kunci.** Service role key belum pernah dirotasi sejak
  project dibuat.
- **Storage bucket** (`datasets`) policy-nya belum diprobe seperti tabel di atas.
  File aslinya diunggah lewat service role dan tidak pernah dibaca balik oleh
  aplikasi, tapi itu argumen, bukan bukti.

# Tech debt

Utang teknis yang diambil sadar, beserta pemicu yang membuatnya harus dibayar.
Tambahkan baris baru lewat PR yang menciptakan utangnya, jangan belakangan.

## Terbuka

### `after()` tidak punya retry di level job

Job analisis dipicu `after()` di route handler ([ADR-0006](adr/0006-after-as-job-trigger.md)).
Kalau invocation mati di tengah jalan, job tertinggal di status `running`
selamanya dan tidak ada yang mencoba lagi.

**Pemicu:** dataset pertama yang gagal karena timeout, atau job pertama yang
tersangkut `running` di produksi. **Bayar dengan:** queue sungguhan.

### Estimasi waktu di dialog analisis terlalu optimistis

`estimateJobSeconds` menaksir 8 detik untuk pekerjaan yang nyatanya 19 detik
([eval](research/prompt-v1-eval.md#akurasi-estimasi)). Estimator mengabaikan
`MAX_CONCURRENCY = 4` dan latensi per batch.

**Pemicu:** pengguna mengeluh analisis "menggantung". **Bayar dengan:** kalibrasi
ulang konstanta memakai durasi job yang sudah tercatat di `analysis_jobs`.

### `analysis.v1` tidak memutuskan permintaan sopan

Permintaan tanpa keluhan eksplisit kadang netral, kadang negatif — 2 dari 20
kalimat uji goyah. Penyebabnya few-shot yang tidak memuat contoh permintaan.

**Pemicu:** laporan sentimen yang tidak konsisten antar job. **Bayar dengan:**
`analysis.v2` berisi satu contoh permintaan sopan plus aturan eksplisitnya.

### `types/database.ts` masih ditulis tangan

`pnpm db:types` belum pernah dijalankan terhadap project sungguhan, jadi tipe
tabel dipelihara manual dan bisa menyimpang dari schema tanpa ketahuan.

**Diperbarui 2026-09-25:** script-nya dulu `supabase gen types --local`, yang
menyasar stack Docker di port 54322 — bukan project hosted yang dipakai
aplikasi. Jadi bukan cuma "belum dijalankan": kalaupun dijalankan, hasilnya
datang dari database yang salah. Sekarang `pnpm db:types` memanggil
[`scripts/gen-types.mjs`](../scripts/gen-types.mjs) yang memakai `--linked`,
menolak menimpa file kalau outputnya bukan schema, dan menulis header
"generated — do not edit" sendiri.

**Yang menghalangi sekarang tinggal satu:** `--linked` butuh access token
(`supabase login` atau `SUPABASE_ACCESS_TOKEN`), yang bukan bagian dari
`.env.local`.

**Pemicu:** migrasi berikutnya yang menambah kolom. **Bayar dengan:** `supabase
login`, lalu `pnpm db:types`, lalu commit hasilnya bersama diff-nya.

### ~~`/reports` dan `/reports/[id]` masih placeholder~~ — lunas (Fase 4)

Keduanya sekarang berisi dashboard lengkap. Disimpan di sini sebagai catatan
bahwa utang ini memang dibayar, bukan dihapus diam-diam.

### Email auth menunggu SMTP dan template di dashboard

Alur verifikasi email dan reset password sudah benar di kode dan sudah diuji
di project hosted (ADR-0009), tapi pengirim email bawaan Supabase hanya mengirim
ke anggota tim project. Selama itu, pengguna sungguhan yang mendaftar pakai
email tidak menerima tautan verifikasi.

**Pemicu:** sebelum pengguna pertama di luar tim. **Bayar dengan:**
`docs/auth-setup.md` langkah 1–7.

### Ganti password dari pengaturan tidak meminta password lama

"Ganti password" di pengaturan membuka `/reset-password`, yang hanya butuh sesi.
Siapa pun yang memegang sesi yang tercuri bisa mengganti password tanpa tahu
password lamanya. Ini perilaku default Supabase (_Secure password change_ mati).

**Pemicu:** organisasi pertama yang datanya sensitif, atau laporan sesi dicuri.
**Bayar dengan:** menyalakan _Secure password change_ dan menambah langkah
`reauthenticate()` (kode OTP ke email) di form ganti password.

### E2E hanya menguji landing page

`tests/e2e/upload-analyze-report.spec.ts` punya satu test aktif; alur
upload→analisis→laporan di-`skip` karena belum ada fixture auth. Alur itu sudah
terbukti jalan, tapi lewat pengujian manual, bukan lewat CI.

**Pemicu:** regresi pertama yang lolos ke main. **Bayar dengan:** fixture yang
membuat user terkonfirmasi lewat admin API lalu menyimpan storage state.

Alur auth (daftar → verifikasi → login, lupa → reset password) sudah diuji
end-to-end sekali di project hosted dengan `admin.generateLink`, yang
menghasilkan token email tanpa mengirim email. Skrip itu belum jadi test CI:
ia membuat dan menghapus akun sungguhan, jadi butuh project terpisah untuk CI.

### Seed tidak bisa dipakai untuk project hosted

`pnpm db:seed` membungkus `supabase db reset`, yang menyasar stack lokal. Untuk
project hosted, `supabase/seed.sql` harus ditempel manual ke SQL Editor.

**Pemicu:** anggota tim kedua yang perlu data contoh. **Bayar dengan:** script
seed yang bicara ke project hosted lewat service role.

---

## Ditambahkan di Fase 4

### Grafik tren waktu tidak ada

Checklist 4.2 meminta tren "kalau tanggalnya tersedia". Tidak tersedia:
`responses.created_at` adalah waktu upload, sama persis untuk semua baris dalam
satu dataset, jadi grafiknya akan berupa satu garis vertikal. Tanggal yang asli
ada di kolom _Timestamp_ bawaan Google Forms, yang saat ini masuk ke
`respondent_meta` tanpa dikenali sebagai tanggal.

**Pemicu:** dataset kedua dari organisasi yang sama, ketika orang mulai
bertanya "apakah keluhan kantin makin sering?". **Bayar dengan:** deteksi kolom
tanggal saat mapping (Fase 1.6 sudah punya tempatnya), simpan ke kolom
`responses.responded_at` yang bisa di-null, lalu tambahkan line chart.

### Filter di penjelajah tidak menyetir grafik

Memilih "Negatif" mempersempit tabel di Bagian 5, tapi grafik di atasnya tetap
menampilkan seluruh dataset. Idealnya satu baris filter menyetir semuanya.

Penghalangnya arsitektural, bukan malas: `@/modules/reporting` mengekspor
`buildReport` yang `import 'server-only'`, jadi komponen client tidak bisa
mengimpor public API-nya untuk menghitung ulang agregat di browser.

**Pemicu:** permintaan pertama "tunjukkan topik untuk aspirasi negatif saja".
**Bayar dengan:** pecah public API reporting jadi dua — agregator murni yang
aman untuk client, dan service yang menyentuh database.

### Halaman laporan membawa 109 kB JS

Recharts (beserta d3) membuat `/reports/[id]` jadi 326 kB first load, jauh di
atas halaman lain yang ~106 kB. Di jaringan sekolah itu terasa.

**Pemicu:** keluhan "laporannya lama kebuka" dari user sungguhan. **Bayar
dengan:** `next/dynamic` untuk dua chart Recharts, supaya KPI tile dan sebaran
sentimen (keduanya HTML biasa, tanpa Recharts) tampil lebih dulu.

### ~~Realtime belum terbukti end-to-end~~ — lunas 2026-09-22

Migrasi `20260921000100_realtime_analysis_jobs.sql` sudah dijalankan dan
`analysis_jobs` sekarang ada di publication `supabase_realtime`. Diverifikasi
end-to-end di browser: job `running` → `succeeded` memunculkan toast "Analisis
selesai — laporan diperbarui." dan frame `postgres_changes` terlihat di
websocket.

Verifikasi itu menemukan satu bug nyata: channel-nya subscribe sebelum session
diserahkan ke socket realtime, jadi RLS membuang semua row. Gejalanya menipu —
channel tetap membalas `SUBSCRIBED` dan server tetap bilang "Subscribed to
PostgreSQL", tapi tidak ada satu pun event yang datang. Diperbaiki dengan
`supabase.realtime.setAuth(token)` sebelum `.subscribe()`.

**Catatan untuk lain kali:** status channel bukan bukti. Satu-satunya bukti
adalah event yang benar-benar sampai. Perubahan `alter publication` juga butuh
beberapa detik sebelum Realtime memakainya — probe pertama setelah migrasi bisa
gagal padahal migrasinya benar.

### Checkpoint 4.6 belum dikerjakan

Demo dashboard ke 2-3 target user (ketua OSIS, panitia) dan catatan grafik mana
yang berguna belum ada. Ini butuh orang, bukan kode.

**Pemicu:** sebelum mulai Fase 5. **Bayar dengan:** satu sesi 30 menit dengan
pengurus OSIS sungguhan, pakai dataset mereka sendiri.

### PDF tanpa nomor halaman

`render` prop di `@react-pdf/renderer` — satu-satunya cara mendapat
`pageNumber`/`totalPages` — tidak menghasilkan apa pun di dokumen laporan,
diam-diam. Diukur, bukan ditebak: di dokumen minimal, `<Text fixed render=...>`
muncul normal; di `pdf-exporter.tsx` tidak, bahkan ketika callback-nya
mengembalikan string konstan. `<Text fixed>` dengan children statis di posisi
yang persis sama muncul.

Footer sekarang memuat nama organisasi dan dataset, tanpa nomor halaman.
Laporan 2-3 halaman masih terbaca, tapi kalau nanti jadi lebih panjang ini
perlu dibereskan.

**Catatan untuk lain kali:** tiga bentuk footer gagal tanpa pesan error apa pun
(flex row di dalam box absolute, `left` + `right` bersamaan, dan `render`).
Satu-satunya cara menemukannya adalah merender PDF-nya lalu melihatnya.

### Chart PDF digambar ulang, tidak reuse Recharts

Bar di PDF disusun dari primitif `<View>`, terpisah dari komponen Recharts di
web. Kalau bentuk chart berubah, dua tempat harus diubah. Trade-off ini diambil
sadar di ADR-0004 dan masih wajar selama chart-nya bar sederhana.

### Settings: foto profil, undang anggota, hapus akun

Checklist 7.5 menyebut empat hal yang belum ada:

- **Foto profil** — butuh bucket storage, upload, crop, dan penanganan gambar
  besar. Avatar sekarang memakai inisial dari nama.
- **Undang anggota lewat email** — checklist menandainya opsional untuk MVP.
  Butuh alur undangan (token, email, penerimaan) yang setara ukurannya dengan
  7.4, jadi ditunda bersama.
- **Hapus akun** — sengaja tidak dibuat. Ini tidak bisa dibatalkan dan menyentuh
  `auth.users` plus cascade ke seluruh data organisasi. Membuat tombolnya
  setengah jalan lebih berbahaya daripada tidak ada tombol sama sekali. DoD 7.5
  hanya mensyaratkan edit profil dan nama organisasi, dan keduanya sudah jalan.
- **Nama tampilan disimpan di `auth.users.user_metadata`**, bukan tabel
  `profiles`. Kalau profil nanti punya field kedua, pindahkan ke tabel sendiri.

### RLS organisasi lebih longgar dari policy modul

`organizations_update` di RLS mengizinkan `owner` dan `admin`, sedangkan
`can(role, 'org:manage')` hanya `owner`. Route memakai yang lebih ketat, jadi
perilakunya benar, tapi dua sumber aturan yang tidak sama persis itu menunggu
untuk membingungkan seseorang. Samakan salah satunya.

### Checkpoint 7.6 belum lengkap: butuh orang

Happy path-nya sudah diverifikasi mesin (lihat `docs/research/phase-7-findings.md`):
unggah CSV → analisis → ringkasan AI → laporan → export PDF dan CSV, semuanya
jalan di browser dengan data nyata dan nol error. Yang belum ada adalah bagian
7.6 yang tidak bisa dikerjakan tanpa orang: mendemokan ke ketua OSIS/panitia dan
mengumpulkan umpan balik. Ini item yang sama dengan checkpoint 4.6.

### Kutipan per topik bisa berulang di dataset dengan kalimat mirip

Di `aspirasi-120`, bagian "Contoh aspirasi per topik" di PDF menampilkan tiga
varian dari kalimat yang hampir sama. `topResponsesByTopic` memilih satu negatif,
satu positif, lalu sisanya berdasarkan confidence — tidak ada dedup kemiripan.
Di dataset sintetis ini wajar; di dataset nyata perlu dicek sebelum diputuskan
apakah butuh penyaring kemiripan.

### 7.4 Share link publik — ditunda, dengan sketsa

Sengaja tidak dibuat di fase ini. Ini satu-satunya item 7.x yang melebarkan
permukaan keamanan: route publik yang meng-autentikasi lewat token, bukan lewat
sesi, jadi RLS tidak lagi jadi batas utamanya.

Sketsa kalau nanti dikerjakan:

- Tabel `report_shares` (`job_id`, `organization_id`, `token_hash`,
  `created_by`, `revoked_at`, `expires_at`).
- **Simpan hash token, bukan tokennya.** Token asli hanya muncul sekali, saat
  dibuat. Bocornya isi tabel tidak boleh langsung jadi akses baca.
- Satu link = satu job. Tidak ada token level organisasi.
- `app/(public)/shared/[token]/page.tsx` read-only: tanpa explorer, tanpa
  regenerate, tanpa export — hanya ringkasan dan grafik.
- Pencabutan mengisi `revoked_at`; halaman publik memeriksanya di setiap request,
  bukan hanya saat token dibuat.

---

## Ditambahkan di Fase 9

### Migrasi fase 9 belum diterapkan ke project hosted

`20260924000100_rate_limits.sql` dan `20260924000200_analysis_jobs_org_index.sql`
belum jalan. CLI Supabase tidak bisa menyambung tanpa password database, dan
password itu tidak ada di `.env.local`.

Akibatnya hari ini: rate limiter **gagal terbuka** (request tetap lewat,
`security.rate_limit.unavailable` tercatat) dan query per-organisasi di
`analysis_jobs` masih sequential scan. Dua-duanya degradasi yang aman, tapi
dua-duanya berarti kontrolnya belum benar-benar aktif.

**Pemicu:** sekarang. **Bayar dengan:** tempel kedua file ke SQL Editor —
keduanya idempoten — lalu jalankan `node --env-file=.env.local
scripts/check-rls.mjs` dan pastikan baris SKIP terakhir berubah jadi PASS.

### Sentry belum dipasang

Checklist 9.4 meminta error tracking dengan DoD "sample error muncul di
dashboard". Itu butuh akun yang tidak bisa dibuat dari sini, dan integrasi yang
tidak bisa dibuktikan jalan lebih buruk daripada tidak ada integrasi. SDK-nya
juga menambah puluhan kB ke bundle client yang baru saja dipangkas di 9.3.

Yang sudah ada sebagai gantinya: korelasi `requestId` dari edge sampai ke log
line, terbukti end-to-end.

**Kalau nanti dipasang, dua titik sambungnya:**

- Server: `logger.error` di `modules/shared/logger/logger.ts` — satu-satunya
  tempat error server keluar. Kirim dari sana, lengkap dengan `requestId` yang
  sudah ada di context.
- Client: `ErrorState` di `components/layout/error-state.tsx` — satu-satunya
  tempat error render ditangkap. `error.digest` adalah kunci yang menyambungkan
  ke stack trace server.

`SENTRY_DSN` sudah ada di `.env.example` dan `lib/env.ts` sebagai optional.

### Halaman legal masih draf

`lib/legal/controller.ts` berisi placeholder `TODO` untuk nama penanggung jawab
data, email kontak, dan alamat. Selama placeholder itu ada, keempat halaman
legal menampilkan banner merah "Draf — belum siap dipakai".

Belum ditinjau ahli hukum. Ditulis mengikuti struktur UU PDP No. 27/2022, tapi
itu bukan pengganti peninjauan.

**Pemicu:** sebelum pengguna sungguhan pertama. **Bayar dengan:** isi empat
konstanta itu, lalu minta seseorang yang paham UU PDP membacanya.

### CSV injection belum ditangani

Aspirasi yang diawali `=`, `+`, `-`, atau `@` tersimpan apa adanya di export
CSV, dan Excel mengeksekusi sel seperti itu sebagai formula. Serangannya butuh
korban membuka file di Excel dan menyetujui prompt, jadi dampaknya terbatas —
tapi ini export yang memang dibuat untuk dibuka di Excel.

**Bayar dengan:** prefiks `'` pada sel yang diawali keempat karakter itu, di
`csv-exporter.ts`. Satu fungsi, satu test.

### Semua halaman sekarang dinamis

Membaca `headers()` di root layout untuk mengambil nonce CSP membuat seluruh
route jadi `ƒ (Dynamic)`, termasuk landing page yang tadinya statis. Ini harga
yang dipilih sadar (lihat `docs/security-audit.md` bagian 7), dan Lighthouse
mobile tetap 97.

Efek sampingnya yang terukur: `cache-control: no-store` pada dokumen utama
membuat halaman tidak bisa masuk back/forward cache browser.

**Kalau nanti jadi masalah:** landing page bisa dipisah ke layout sendiri yang
tidak membaca `headers()`, dengan ThemeProvider tanpa nonce — halaman itu tidak
punya data dan tidak punya sesi.

### Halaman login membawa RealtimeClient yang tidak dipakai

`/login` dan `/signup` 210 kB first load. Chunk terbesarnya 245 kB mentah, dan
`grep` menemukan `GoTrueClient` **dan** `RealtimeClient` di dalamnya:
`@supabase/supabase-js` membundel klien realtime bersama klien auth, dan halaman
login tidak pernah membuka websocket.

Masih di bawah target 300 kB, jadi belum dibayar.

**Bayar dengan:** memakai `@supabase/auth-js` langsung di halaman auth, atau
memindahkan sign-in ke server action sehingga supabase-js tidak pernah masuk
bundle client sama sekali.

### Rate limit memakai jendela tetap

Lonjakan tepat di batas jendela bisa sebentar mencapai dua kali limit. Diterima
sadar: alternatifnya satu baris per request, yang membuat tabel tumbuh tanpa
batas. Juga belum ada pembersihan baris `rate_limits` yang jendelanya sudah
lewat — indeks `rate_limits_window_idx` sudah disiapkan untuk itu.

### Tidak ada audit dependensi terjadwal

`pnpm audit` belum jadi bagian CI, dan service role key belum pernah dirotasi.
Kedua hal ini dicatat di `docs/security-audit.md` bagian 9 sebagai batas audit.

### File yatim di storage tidak pernah disapu

Menghapus dataset sekarang menghapus objeknya di bucket juga, tapi kalau
bucket-nya sedang tidak bisa dihubungi, barisnya tetap terhapus dan filenya
tertinggal — hanya ada satu baris log `ingestion.dataset.object_orphaned`
berisi path-nya.

**Bayar dengan:** job berkala yang membandingkan isi bucket `datasets` dengan
kolom `storage_path`, plus alert pada pesan log itu begitu Sentry terpasang.
Sebelum perbaikan ini, kebocorannya permanen dan diam-diam: `deleteDataset`
tidak pernah menyentuh storage sama sekali.

---

## Ditambahkan di Fase A (blocker pilot)

### File unggahan asli masih memuat kolom yang dibuang

Sejak A.4, kolom non-teks tidak lagi disimpan ke `respondent_meta` kecuali
dicentang. Tapi file CSV/Excel aslinya tetap masuk bucket `datasets` **apa
adanya**, lengkap dengan nama dan email yang baru saja dibuang dari baris.

Ini disengaja — tanpa file asli, hasil analisis tidak bisa ditelusuri ulang —
dan sudah ditulis terang-terangan di `/privacy` serta
[`docs/pilot-data-posture.md`](pilot-data-posture.md). Tapi artinya minimisasi
itu berlaku untuk database, bukan untuk storage.

**Pemicu:** permintaan penghapusan dari satu responden, yang saat ini hanya
bisa dipenuhi dengan menghapus seluruh dataset. **Bayar dengan:** simpan file
yang sudah dipangkas kolomnya, bukan file mentah — atau hapus file asli
otomatis setelah N hari, karena nilainya untuk audit habis jauh lebih cepat
daripada nilainya sebagai data pribadi.

### `lib/legal/controller.ts` masih placeholder

Empat nilai masih `TODO`, dan `/privacy` menampilkannya apa adanya ke
pengunjung: "Pengendali data untuk SAMOSA adalah TODO: nama penanggung jawab
SAMOSA" dan "Permintaan dikirim ke TODO@example.com". Banner merah muncul
selama itu terjadi, jadi ini kentara, bukan diam-diam.

Tidak bisa diisi dari kode — butuh identitas hukum sungguhan.

**Pemicu:** pengguna pertama yang bukan pembuatnya. **Bayar dengan:** isi empat
nilai itu; banner-nya hilang sendiri.

### Email verifikasi dan reset password dimatikan

Belum ada domain untuk mengirim email (Resend), jadi _Confirm email_ di
Supabase Off dan `NEXT_PUBLIC_EMAIL_LINKS_ENABLED` kosong
([`docs/auth-setup.md`](auth-setup.md) §0). Akibatnya:

- Siapa pun bisa mendaftar memakai alamat email orang lain; tidak ada yang
  membuktikan pemilik alamatnya.
- Pengguna yang lupa password tidak bisa memulihkannya sendiri.

**Pemicu:** ada domain, atau penguji pertama yang lupa password. **Bayar
dengan:** langkah 1–7 di `docs/auth-setup.md`, env ke `true`, _Confirm email_
On. Kodenya (ADR-0009) sudah ada dan tidak perlu diubah.

### Sweeper hanya jalan sekali sehari

Paket Hobby Vercel menolak deployment yang punya cron lebih sering dari sekali
sehari, jadi `sweep-jobs` dijadwalkan `0 3 * * *` (10.00 WIB), bukan tiap lima
menit. Akibatnya job yang mati di tengah jalan bisa terlihat "berjalan" sampai
~24 jam sebelum ditandai gagal, dan halaman laporannya menunggu selama itu.

**Pemicu:** job nyangkut pertama yang dilaporkan penguji, atau pindah ke paket
Pro. **Bayar dengan:** kembalikan jadwal ke `*/5 * * * *` di Pro, atau panggil
`sweepStuckJobs()` saat status job dibaca, supaya pembacanya sendiri yang
memicu penyapuan.

### Sweeper jalan tanpa jejak siapa yang menyapu

[`sweepStuckJobs`](../modules/analysis/services/stuck-job-sweeper.ts) menandai
job `failed` dan menulis satu baris log, tapi tidak mencatat di baris job-nya
bahwa yang menandai adalah sweeper, bukan kegagalan analisis sungguhan.
`error_message`-nya memang khas, tapi itu string, bukan kolom.

**Pemicu:** pertanyaan "berapa sering job nyangkut?" yang tidak bisa dijawab
dengan query. **Bayar dengan:** kolom `failure_reason` bertipe enum.

### Tidak ada tombol "Coba lagi" di UI

Guard di `runJob` membuat job yang sudah `failed` tidak bisa dijalankan ulang di
tempat — dan itu memang disengaja, supaya percobaan yang gagal tetap tercatat.
Konsekuensinya: mengulang analisis harus lewat membuat job baru, dan tombolnya
belum ada. Sekarang pengguna harus kembali ke dataset dan menekan "Mulai
analisis" lagi.

**Pemicu:** job pertama yang disapu sweeper di depan pengguna sungguhan.
**Bayar dengan:** tombol di halaman status analisis yang memanggil
`POST /api/analysis` dengan `datasetId` yang sama.

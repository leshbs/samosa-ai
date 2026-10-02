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

### Settings: foto profil, undang anggota, hapus akun — sebagian lunas (Fase 5)

Foto profil, undangan anggota, dan pemindahan nama tampilan ke tabel `profiles`
dikerjakan di Fase 5 (ADR-0010). Yang tersisa hanya **hapus akun pribadi**: yang
ada sekarang adalah hapus _organisasi_ (Pengaturan → Data & Privasi); akun
setiap anggota tetap hidup setelahnya. Catatan aslinya:

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

### ~~RLS organisasi lebih longgar dari policy modul~~ — lunas (Fase 5)

`organizations_update` sekarang owner-only, sama dengan `can(role, 'org:manage')`
(migrasi `20260929000100`, ADR-0010). Catatan aslinya:

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

### Migrasi fase 9 di project hosted — rate limit lunas, indeks belum terbukti

**Diperbarui 2026-10-01.** `20260924000100_rate_limits.sql` sudah aktif:
`scripts/check-rate-limit.mjs` lulus 10/10 terhadap project hosted, jadi rate
limiter tidak lagi gagal terbuka.

Yang tersisa: `20260924000200_analysis_jobs_org_index.sql`. Indeks tidak
terlihat lewat PostgREST, jadi tidak ada probe yang bisa membuktikannya dari
sini. Kalau belum ada, akibatnya hanya kinerja — query per-organisasi di
`analysis_jobs` masih sequential scan.

**Pemicu:** sebelum ronde 1 di [`workspace-plan.md`](workspace-plan.md), yang
menambah filter organisasi ke query-query itu. **Bayar dengan:** jalankan ini di
SQL Editor —

```sql
select indexname from pg_indexes
where tablename = 'analysis_jobs' and indexname = 'analysis_jobs_org_created_idx';
```

— dan kalau hasilnya kosong, tempel file migrasinya (idempoten).

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

---

## Ditambahkan di Fase 5 (pengaturan & profil)

### ~~Migrasi pengaturan belum diterapkan ke project hosted~~ — lunas 2026-10-01

Sudah aktif: `scripts/check-rls.mjs` lulus 25/25 terhadap project hosted, tanpa
baris SKIP. Yang tersisa hanya membuang fallback `created_by` di `createJob`,
yang sekarang tidak pernah terpakai. Catatan aslinya:

`20260929000100_settings_members_profile.sql` menambah `profiles`,
`organization_invitations`, kolom pengaturan di `organizations`,
`analysis_jobs.created_by`, bucket `branding`, dan tiga fungsi. Sudah
diverifikasi di PGlite (`pnpm db:check`, 57 cek), belum di project hosted.

Kode yang dipakai di setiap halaman tetap jalan tanpa migrasi ini: sesi membaca
`organizations` dengan `*` dan profil sebagai opsional, daftar job memakai `*`,
dan `createJob` mengulang insert tanpa `created_by` kalau kolomnya belum ada
(log `analysis.job.created_by_unavailable`). Yang tidak jalan sampai migrasi
diterapkan: semua fitur baru di Pengaturan dan Profil.

**Pemicu:** sekarang, sebelum merge. **Bayar dengan:** tempel file itu ke SQL
Editor (idempoten), lalu `node --env-file=.env.local scripts/check-rls.mjs` —
baris SKIP "profiles, invitations and membership writes" harus berubah jadi
sepuluh PASS. Setelah itu fallback `created_by` di `createJob` boleh dihapus.

### Kuota bulanan (checklist 5.4) — ditunda atas keputusan produk

Tab Pemakaian menampilkan total dan biaya per analisis, tapi belum ada kuota
("2 dari 3 analisis gratis bulan ini"): memblokir analisis adalah keputusan
harga, bukan teknis, dan diputuskan ditunda selama pilot.

**Diperbarui 2026-10-01:** keputusannya sudah ada (ADR-0012) dan arahnya
berbalik — **tidak ada kuota yang terlihat pengguna.** Yang dibuat di ronde 4
[`workspace-plan.md`](workspace-plan.md) adalah batas penyalahgunaan per akun
yang tidak diiklankan. Sketsa di bawah masih berguna untuk cara menghitungnya,
tapi bukan untuk tampilan "sisa kuota".

Sketsa kalau nanti dikerjakan: batas dari env (`ANALYSIS_MONTHLY_QUOTA`, kosong =
tanpa batas) atau kolom `organizations.monthly_analysis_quota` untuk pengecualian
per sekolah; hitung `analysis_jobs` bulan berjalan (zona waktu organisasi) per
`organization_id`, kecuali yang `failed` tanpa hasil; tolak di `POST
/api/analysis` sebelum `createJob` dengan kalimat yang menyebut kapan kuota
kembali; dan tampilkan sisa, bukan hanya yang terpakai, di tab Pemakaian dan di
dialog "Mulai analisis".

### Satu akun hanya bisa anggota satu organisasi

Keputusan sadar di ADR-0010. Penerimaan undangan ditolak kalau akun itu sudah
punya organisasi berisi data. Pembina yang mendampingi dua organisasi harus
memakai dua akun.

**Pemicu:** permintaan pertama dari pengguna yang benar-benar butuh dua
organisasi. **Bayar dengan:** "organisasi aktif" di sesi (cookie), pemilih
organisasi di sidebar, dan `getSessionUser()` yang memilih keanggotaan itu
alih-alih `.limit(1)`. RLS tidak perlu berubah — `current_org_ids()` sudah
mengembalikan himpunan.

**Diperbarui 2026-10-01:** dijadwalkan. ADR-0012 menggantikan keputusan ini, dan
pembayarannya ada di ronde 1–2 [`workspace-plan.md`](workspace-plan.md). Satu hal
yang sketsa di atas lewatkan: query yang hanya mengandalkan RLS (misalnya
`listJobs()`) akan mencampur data dua ruang kerja, jadi semuanya harus diaudit
sebelum akun mana pun boleh punya dua keanggotaan.

**Diperbarui 2026-10-02:** audit itu selesai (ronde 1). Sesi memilih ruang kerja
aktif dan setiap query memfilternya; yang tersisa di ronde 2 adalah membiarkan
orang benar-benar punya dua keanggotaan, dan pemilihnya.

**Lunas di kode 2026-10-02 (ronde 2):** menerima undangan menambah keanggotaan,
ada pemilih ruang kerja, dan anggota bisa keluar. Batasnya sekarang "satu yang
dimiliki plus satu yang diikuti" — lebih dari satu yang diikuti ada di ronde 5.
Belum aktif di project hosted sampai migrasi di bawah ditempel.

### Migrasi ronde 2 belum diterapkan ke project hosted

**Lunas 2026-10-02.** Kedua file ditempel setelah PR ronde 2 di-deploy;
`scripts/check-rls.mjs` 44/44 tanpa baris SKIP. Catatan aslinya:

Dua file, dengan urutan yang **penting**:

1. `20261002000100_join_and_leave.sql` — boleh ditempel kapan saja, sebelum atau
   sesudah deploy. Sampai ditempel: menerima undangan masih memakai fungsi lama
   (menghapus organisasi kosong milik penerima, menolak yang berisi data dengan
   pesan umum), konfirmasi "keluar dari X" gagal dengan pesan umum, tombol
   "Keluar" di Profil gagal untuk peran anggota dan pembaca, dan nama orang
   yang sudah keluar hilang dari laporan lama.
2. `20261002000200_account_required.sql` — **hanya setelah kode ronde 1 dan 2
   di-deploy.** Kode lama membuat organisasi tanpa akun; dengan `NOT NULL`
   pendaftarannya gagal.

**Pemicu:** begitu PR ronde 2 di-merge dan Vercel selesai deploy. **Bayar
dengan:** tempel keduanya berurutan, lalu `node --env-file=.env.local
scripts/check-rls.mjs` — dua baris SKIP harus berubah jadi sembilan PASS.

### Undangan di halaman sambutan hanya ditampilkan, tidak bisa diterima

`/welcome` menampilkan undangan yang menunggu untuk email yang sedang masuk,
tapi bergabung tetap lewat tautan: token tidak disimpan, dan tautan itulah
kredensialnya. Daftar itu juga hanya muncul kalau alamatnya terbukti milik orang
itu — email link aktif, atau ada identitas Google untuk alamat yang sama. Tanpa
verifikasi email siapa pun bisa mendaftar dengan alamat orang lain, dan daftar
itu akan memberi tahu mereka organisasi mana yang menunggu orang tersebut.

Satu celah tersisa: akun yang dibuat saat email link masih mati tetap dianggap
terverifikasi begitu `NEXT_PUBLIC_EMAIL_LINKS_ENABLED` dinyalakan.

**Pemicu:** domain email aktif (lihat "Email aplikasi mati sampai ada domain").
**Bayar dengan:** fungsi `security definer` yang menerima undangan berdasarkan
id untuk pemilik alamat yang terverifikasi (`auth.users.email_confirmed_at`
tidak cukup selama autoconfirm menyala), dan tombol "Gabung" di halaman itu.

### Batas ruang kerja dihitung dari keanggotaan, bukan dari akun

**Lunas 2026-10-02 (ronde 3):** `createWorkspace` menghitung `organizations`
per akun, dan serah terima melepas ruang kerja dari akun pemilik lama. Sampai
`20261002000300_transfer_moves_account.sql` ditempel, pemilik lama yang sudah
menyerahkan ruang kerjanya belum bisa membuat yang baru. Catatan aslinya:

`createWorkspace` menghitung ruang kerja yang dimiliki dari baris `owner` di
`organization_members`. Menurut ADR-0012 batasnya per akun, tapi sampai serah
terima ikut memindahkan akun, akun pemilik lama masih memuat ruang kerja yang
bukan miliknya lagi dan akan menghalanginya membuat yang baru.

**Pemicu:** ronde 3, saat serah terima memindahkan akun. **Bayar dengan:**
hitung `organizations where account_id = …`.

### Migrasi ronde 3 belum diterapkan ke project hosted

**Lunas 2026-10-03.** `scripts/check-rls.mjs` 46/46 tanpa SKIP. Catatan aslinya:

`20261002000300_transfer_moves_account.sql` mengganti
`transfer_organization_ownership` supaya akun ikut pindah. Boleh ditempel kapan
saja, sebelum atau sesudah deploy. Sampai ditempel: serah terima tetap jalan
tapi ruang kerjanya tertinggal di akun pemilik lama.

**Pemicu:** begitu PR ronde 3 di-merge. **Bayar dengan:** tempel file itu, lalu
`node --env-file=.env.local scripts/check-rls.mjs` — satu SKIP jadi dua PASS.

### Serah terima ke orang yang sudah punya akun mengganti paketnya

Satu orang hanya punya satu akun. Kalau penerima serah terima sudah punya akun,
ruang kerjanya pindah ke akun itu dan mengikuti paketnya — ruang kerja dari
akun berbayar yang diserahkan ke pemilik akun Free menjadi Free, dan akun Free
penerima bisa memuat dua ruang kerja (batasnya hanya diperiksa saat membuat).
Tidak ada yang terhapus atau terkunci hari ini karena belum ada fitur yang
dibatasi paket selain jumlah anggota dan ruang kerja.

**Diputuskan 2026-10-03:** paket penerima yang berlaku. Sejak ronde 4 itu
berarti ruang kerja dari akun berbayar yang diserahkan ke pemilik akun Gratis
mulai punya masa simpan, dihitung dari `retention_clock_at` tiap dataset — data
yang sudah lebih dari setahun langsung masuk masa peringatan. Tidak ada yang
terjadi tanpa pemberitahuan: sweep tetap mengirim dua email dan menunggu paling
sedikit 7 hari sebelum mengarsipkan, lalu 90 hari sebelum menghapus.

**Pemicu:** pelanggan berbayar pertama. **Bayar dengan:** kalimat di dialog
serah terima yang menyebut paket kedua pihak dan apa akibatnya untuk masa
simpan.

### "Solo" diturunkan dari dua hitungan di setiap request

`session.solo` = satu anggota dan nol undangan yang belum dipakai atau
dibatalkan. Tidak ada kolom, jadi tidak ada migrasi, tapi sesi sekarang enam
round-trip, dan undangan yang kedaluwarsa tanpa dibatalkan membuat ruang kerja
tetap tampil sebagai organisasi.

**Pemicu:** latency halaman terasa, atau keluhan "kenapa masih ada tab
Anggota". **Bayar dengan:** kolom `organizations.shared_at`, diisi undangan
pertama.

### Kedatangan pertama ditandai oleh baris `profiles`

`completeSignIn()` menganggap orang "sudah pernah datang" kalau baris profilnya
ada. Tidak ada kolom khusus, supaya tidak ada migrasi yang harus ditempel
sebelum pendaftaran bisa jalan. Akibatnya: kalau `ensureProfile` gagal setelah
ruang kerja dibuat, lalu orang itu kehilangan ruang kerjanya, login berikutnya
membuatkan ruang kerja baru alih-alih menampilkan `/welcome`. Salahnya ke arah
yang aman — tidak ada yang terhapus.

**Pemicu:** laporan pertama tentang ruang kerja yang "muncul sendiri". **Bayar
dengan:** kolom `profiles.onboarded_at`.

### Migrasi `accounts` belum diterapkan ke project hosted

**Lunas 2026-10-02.** File sudah ditempel; `scripts/check-rls.mjs` 35/35 tanpa
baris SKIP. Backfill di project hosted: 6 organisasi, 6 akun (satu tanpa
pemilik), tidak ada organisasi tanpa akun. Catatan aslinya:

`20261001000100_accounts.sql` menambah `accounts` dan `organizations.account_id`
dan mengisi satu akun per pemilik. Sudah diverifikasi di PGlite (`pnpm
db:check`, 74 cek), belum di project hosted — `scripts/check-rls.mjs` mencetak
SKIP "accounts are private to their workspace and read-only".

Tidak ada yang rusak tanpanya: belum ada kode yang membaca paket, dan
`provisionOrganization` membuat organisasi tanpa akun kalau tabelnya belum ada
(log `auth.account.unavailable`). Organisasi yang lahir di sela itu diisi oleh
backfill saat file ditempel — karena itu menempelnya dua kali aman dan berguna.

**Pemicu:** sebelum ronde 2. **Bayar dengan:** tempel file itu ke SQL Editor,
lalu `node --env-file=.env.local scripts/check-rls.mjs` — SKIP harus jadi enam
PASS.

### `organizations.account_id` masih boleh kosong

**Lunas 2026-10-02 (ronde 2):** `ensureAccount` gagal keras, dan
`20261002000200_account_required.sql` mengunci kolomnya di project hosted.
Catatan aslinya:

Sengaja, supaya urutan "tempel migrasi" dan "deploy kode" tidak penting. Selama
kolom ini nullable, `resolveLimits` harus terus memperlakukan akun yang hilang
sebagai paket gratis.

**Pemicu:** ronde 2, setelah migrasi di atas aktif dan `select count(*) from
organizations where account_id is null` mengembalikan 0. **Bayar dengan:**
migrasi `alter column account_id set not null`, dan `ensureAccount` yang gagal
keras alih-alih mengembalikan null.

### Email aplikasi mati sampai ada domain

Undangan, pemberitahuan serah terima, dan "analisis selesai" sudah ditulis dan
diuji (ADR-0011), tapi tidak terkirim sampai `RESEND_API_KEY` dan `EMAIL_FROM`
diisi. Undangan tetap bisa dipakai sebagai tautan yang dibagikan sendiri.

**Pemicu:** sama dengan "Email verifikasi dan reset password dimatikan" —
keduanya dibayar dengan domain yang sama. **Bayar dengan:** `docs/auth-setup.md`
§1, lalu dua env var itu di Vercel dan redeploy.

### Menautkan Google butuh "manual linking" di Supabase

Tombol "Tautkan Google" di Profil memanggil `linkIdentity`, yang ditolak Supabase
selama _Allow manual linking_ mati (default-nya mati). Tombolnya menjelaskan hal
itu kalau ditolak, tapi belum pernah dicoba sukses end-to-end.

**Bayar dengan:** `docs/auth-setup.md` §5, lalu coba tautkan dari akun password.

### Job yang disapu sweeper tidak mengirim email

"Analisis selesai" dikirim dari `runAnalysisJob`. Job yang mati di tengah jalan
dan ditandai gagal oleh sweeper harian tidak lewat situ, jadi orang yang
menjalankannya tidak diberi tahu.

**Bayar dengan:** panggil `notifyAnalysisFinished` untuk setiap job yang disapu,
di route cron.

### Hasil analisis dibaca tanpa paginasi

`listJobResults` memanggil satu `select` tanpa `range`, dan PostgREST berhenti di
1.000 baris tanpa pesan. Laporan, export per laporan, dan arsip organisasi untuk
job di atas 1.000 aspirasi akan kekurangan baris. Ditemukan saat membuat arsip
(yang untuk dataset mentahnya sudah dipaginasi, `listAllResponses`); belum
diukur di project hosted.

**Pemicu:** dataset pertama di atas 1.000 aspirasi. **Bayar dengan:** loop
`range()` seperti `listAllResponses`, lalu pecah `.in('id', ...)` untuk teks
aspirasi menjadi potongan kecil — seribu UUID di satu URL juga terlalu panjang.

### Arsip organisasi dibuat dalam satu request

Semua PDF dirender berurutan di satu function (`maxDuration = 300`). Cukup untuk
puluhan laporan; organisasi dengan ratusan laporan akan kena batas waktu.

**Pemicu:** export pertama yang gagal karena timeout. **Bayar dengan:** job
latar belakang yang menulis zip ke storage lalu mengirim tautannya.

### Migrasi retensi harus ditempel sebelum PR-nya di-merge

**Lunas 2026-10-03.** Ditempel sebelum merge; `scripts/check-rls.mjs` 50/50
tanpa SKIP. Catatan aslinya:

`20261003000100_retention.sql` menambah `datasets.retention_clock_at`,
`archived_at`, `retention_stage`, `retention_notified_at`, dan
`analysis_jobs.archived_at`. Kebalikan dari migrasi sebelumnya: kode ronde 4
menyebut kolom-kolom itu di setiap daftar dataset dan laporan, jadi **tanpa
migrasinya halaman Dataset, Laporan, dan dashboard gagal dimuat.** Migrasinya
sendiri hanya menambah kolom ber-default, jadi aman untuk kode yang sedang
berjalan.

**Pemicu:** sebelum merge. **Bayar dengan:** tempel file itu, lalu
`node --env-file=.env.local scripts/check-rls.mjs` — satu SKIP jadi empat PASS.

### Retensi tidak berjalan sampai email dan cron dikonfigurasi

**Diperbarui 2026-10-03:** `CRON_SECRET` sudah diisi di Vercel, jadi sweep
berjalan setiap hari. Yang tersisa adalah dua env var email. Catatan aslinya:

Sweep `/api/cron/retention` menolak berjalan tanpa `CRON_SECRET`, dan tanpa
`RESEND_API_KEY` + `EMAIL_FROM` ia tidak mengirim peringatan, tidak
mengarsipkan, dan tidak menghapus (hanya memulihkan). Itu disengaja: data orang
yang tidak pernah membuka aplikasi tidak boleh dihapus tanpa pernah dikirimi
email. Akibatnya sampai ketiganya diisi, "Disimpan sampai …" di aplikasi adalah
tanggal yang tidak dipaksakan siapa pun.

Tidak mendesak: dataset tertua baru jatuh tempo setahun setelah migrasi
ditempel.

**Pemicu:** sama dengan "Email aplikasi mati sampai ada domain", dan paling
lambat sebelas bulan setelah migrasi retensi ditempel. **Bayar dengan:** tiga
env var itu di Vercel, lalu panggil `/api/cron/retention` sekali dengan
`Authorization: Bearer $CRON_SECRET` dan baca ringkasannya (`held` harus 0).

### Menurunkan paket dengan tangan tidak mengulang jam masa simpan

Paket diubah di SQL Editor. Akun yang turun dari Organization ke Gratis
langsung mewarisi masa simpan satu tahun dihitung dari `retention_clock_at`
tiap dataset — yang bisa sudah lewat. Pemiliknya tetap mendapat dua email dan
paling sedikit 7 hari sebelum diarsipkan, tapi bukan satu tahun.

**Pemicu:** penurunan paket pertama. **Bayar dengan:** saat menurunkan, jalankan
juga `update datasets set retention_clock_at = now(), retention_stage = 0,
retention_notified_at = null where organization_id in (…)`; atau jadikan itu
fungsi `set_account_plan`.

### Sweep retensi membaca semua dataset setiap hari

`listRetentionDatasets` memuat setiap dataset (sampai 5.000) lalu memutuskan di
kode. Cukup untuk pilot; di atas itu sweep mencatat
`ingestion.retention.sweep_limit_reached` dan sisanya tidak tersentuh.

**Pemicu:** log itu muncul, atau jumlah dataset mendekati 5.000. **Bayar
dengan:** saring di SQL — dataset yang jamnya lebih tua dari masa simpan
terpendek dikurangi 30 hari, ditambah yang sudah diarsipkan.

### Batas penyalahgunaan dihitung per bulan kalender UTC, tanpa penguncian

`checkMonthlyCap` menjumlahkan `analysis_jobs.total_count` bulan berjalan lalu
membandingkan. Dua analisis yang dimulai bersamaan bisa sama-sama lolos, dan
batasnya terbuka (fail-open) kalau hitungannya gagal dibaca. Cukup untuk
tujuannya — menahan tagihan tak terbatas, bukan menegakkan kuota.

**Pemicu:** batas ini pernah benar-benar tercapai. **Bayar dengan:** penghitung
per akun di Postgres, seperti `rate_limits`.

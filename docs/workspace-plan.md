# Rencana induk: akun, ruang kerja, dan paket

**Disusun:** 2026-10-01
**Keputusan arsitekturnya:** [ADR-0012](adr/0012-accounts-and-workspaces.md)

Dokumen ini adalah urutan kerja untuk mengubah cara orang masuk, bergabung, dan
berbagi di SAMOSA. Aturannya sudah diputuskan; yang ada di sini adalah apa yang
diputuskan, dalam urutan apa dikerjakan, dan kapan tiap ronde dianggap selesai.
Satu ronde, satu PR.

---

## 1. Aturan yang sudah diputuskan

### Model

- **Akun → ruang kerja → anggota.** Akun adalah satuan penagihan dan punya satu
  pemilik. Ruang kerja (`organizations`) adalah satuan isolasi data.
- **"Pribadi" bukan tipe terpisah.** Itu ruang kerja dengan satu anggota.
- Paket dan batasnya ada di `accounts` (`plan`, `limits jsonb`,
  `billing_email`). Policy RLS tidak berubah.

### Masuk dan bergabung

| Situasi                            | Yang terjadi                                                               |
| ---------------------------------- | -------------------------------------------------------------------------- |
| Kedatangan pertama, tanpa undangan | Satu ruang kerja solo dibuat diam-diam. Kata "organisasi" tidak muncul.    |
| Kedatangan pertama, lewat undangan | Bergabung ke organisasi yang mengundang saja. Tidak dibuatkan ruang kerja. |
| Login berikutnya                   | Tidak pernah membuat apa pun.                                              |
| Tidak punya ruang kerja            | Halaman sambutan: undangan yang menunggu, dan "Buat ruang kerja".          |

- **Bergabung selalu menambah.** Tidak ada jalur yang menghapus atau memindahkan
  data.
- **Untuk sekarang: satu ruang kerja yang dimiliki, plus satu yang diikuti.**
  Menerima undangan kedua berarti mengonfirmasi keluar dari yang pertama.
- Orang yang diundang bisa membuat ruang kerja sendiri belakangan.

### Paket

|                            | Free     | Organization | Enterprise     |
| -------------------------- | -------- | ------------ | -------------- |
| Anggota per ruang kerja    | sampai 3 | tanpa batas  | tanpa batas    |
| Ruang kerja per akun       | 1        | sampai 3     | sesuai kontrak |
| Retensi                    | 1 tahun  | permanen     | permanen       |
| Perbandingan antar periode | —        | ya           | ya             |
| Logo di PDF                | —        | ya           | ya             |
| Google Forms               | —        | ya           | ya             |
| Audit log, SSO             | —        | —            | ya             |

- **Tidak pernah dikunci paket:** kualitas analisis, export, serah terima
  kepemilikan.
- **Tidak ada harga per kursi** di bawah Enterprise.
- **Tidak ada batas volume yang terlihat.** Batas penyalahgunaan (misalnya
  50.000 aspirasi per bulan per akun, rate limit, ukuran file) ada tapi tidak
  diiklankan, dan bisa dinaikkan per akun lewat `accounts.limits`.
- **Penagihan manual.** Paket diubah dengan tangan. Harga pilot dikunci untuk
  yang ikut pilot.

### Retensi

1. Peringatan 30 hari dan 7 hari sebelum tenggat, di aplikasi dan lewat email.
2. Tenggat lewat: data **diarsipkan** — tersembunyi, masih bisa diexport, dan
   pulih kalau akunnya upgrade.
3. **90 hari** setelah diarsipkan: dihapus.

Jam untuk data yang sudah ada mulai dihitung sejak perubahan ini diumumkan,
bukan sejak datanya diunggah. Halaman privasi diubah **sebelum** jamnya jalan.

### Dari solo ke bersama

- Selama solo, anggota, peran, dan nama organisasi tidak ditampilkan.
- Undangan pertama meminta nama organisasi dan, di paket Free, menampilkan
  **peringatan saja**: "N dataset dan laporan di sini akan terlihat oleh
  anggota", dengan pengingat untuk menghapus atau mengexport yang pribadi lebih
  dulu. Tidak ada pilihan "buat organisasi terpisah".
- Anggota keempat di Free mendapat pesan yang jelas, bukan error.

---

## 2. Ronde

### Ronde 0 — Keputusan dan prasyarat

- [x] ADR-0012, menggantikan sebagian ADR-0009 dan ADR-0010.
- [x] Dokumen ini.
- [x] `20260924000100_rate_limits.sql` aktif di project hosted —
      `scripts/check-rate-limit.mjs` 10/10 pada 2026-10-01.
- [x] `20260929000100_settings_members_profile.sql` aktif di project hosted —
      `scripts/check-rls.mjs` 25/25 pada 2026-10-01.
- [ ] `20260924000200_analysis_jobs_org_index.sql` — **belum bisa dibuktikan
      dari sini.** Indeks tidak terlihat lewat PostgREST. Cek di SQL Editor
      (lihat `DEBT.md`); kalau kosong, tempel file itu — idempoten.

### Ronde 1 — Fondasi (tidak terlihat pengguna)

- `accounts` dengan pemilik; backfill satu akun per organisasi yang sudah ada;
  `organizations.account_id` wajib diisi setelah backfill.
- `lib/plans.ts`: default tiap paket, digabung dengan `accounts.limits`.
- "Ruang kerja aktif" di sesi; `getSessionUser()` memilih keanggotaan itu, bukan
  `.limit(1)`.
- **Audit setiap query**: yang hari ini hanya mengandalkan RLS (contoh:
  `listJobs()` di tab Pemakaian) harus memfilter ruang kerja aktif.
- `scripts/check-rls.mjs` dan `pnpm db:check` mendapat pengguna dengan dua ruang
  kerja.

**Selesai kalau:** pengguna uji dengan dua ruang kerja tidak pernah melihat data
tercampur di halaman mana pun, dan tidak ada yang berubah bagi pengguna dengan
satu ruang kerja.

### Ronde 2 — Bergabung dan keluar

- Berhenti membuat organisasi untuk pendaftar lewat undangan dan untuk login
  berikutnya.
- Halaman sambutan menggantikan `/no-organization`: undangan yang menunggu dan
  "Buat ruang kerja".
- `accept_organization_invitation` jadi menambah: buang `membership_conflict`
  dan penghapusan organisasi kosong.
- Pemilih ruang kerja — hanya untuk orang yang punya dua.
- "Keluar dari organisasi". Pemilik harus menyerahkan atau menghapus dulu.
- Nama anggota yang sudah keluar tetap tertulis di analisis lama.

**Selesai kalau:** orang yang sudah punya ruang kerja berisi data bisa menerima
undangan tanpa kehilangan apa pun, lalu keluar lagi dan tetap punya datanya.

### Ronde 3 — Dari solo ke bersama

- Ruang kerja solo menyembunyikan anggota, peran, dan nama organisasi.
- Undangan pertama: minta nama, tampilkan peringatan.
- Batas tiga anggota di Free, dengan pesan yang menjelaskan.
- Serah terima satu-satunya ruang kerja milik akun ikut memindahkan akunnya.

**Selesai kalau:** pengguna solo tidak pernah melihat kata "organisasi" sampai
ia sendiri menekan "Undang".

### Ronde 4 — Paket dan retensi

- **Halaman privasi dan `docs/pilot-data-posture.md` diubah lebih dulu.**
- Pengaturan menampilkan paket dan "Disimpan sampai …".
- Peringatan di aplikasi dan lewat email; arsip → 90 hari → hapus.
- Batas penyalahgunaan per akun.

**Selesai kalau:** dataset uji yang tenggatnya dimajukan melewati ketiga tahap —
peringatan, arsip, hapus — dan pulih kalau paketnya dinaikkan sebelum tahap
ketiga.

### Ronde 5 — Belakangan

Perbandingan antar periode, logo di PDF, Google Forms; tautan gabung yang bisa
dipakai ulang dengan persetujuan; salin dataset antar ruang kerja; lebih dari
satu organisasi yang diikuti; item Enterprise.

---

## 3. Risiko

- **Audit query di ronde 1.** Satu query yang terlewat adalah kebocoran data
  antar ruang kerja milik orang yang sama. RLS tidak menangkapnya, jadi hanya
  probe dua-ruang-kerja yang bisa.
- **Email retensi butuh `RESEND_API_KEY` dan `EMAIL_FROM` di Vercel.** Tanpa
  itu ronde 4 hanya bisa memperingatkan di dalam aplikasi, dan menghapus data
  orang yang tidak pernah membuka aplikasi tanpa pernah mengiriminya email
  bukan sesuatu yang boleh dikirim ke produksi.
- **Paket berbayar belum punya isi sampai ronde 5.** Sampai saat itu yang
  dibeli hanya anggota tanpa batas, tiga ruang kerja, dan retensi permanen.
- **Logo di PDF sudah ada, dan hari ini gratis untuk semua.** Fase 5 membuatnya
  (`organizations.logo_path`, dipakai `pdf-exporter.tsx`). Menaruhnya di paket
  Organization berarti mengambilnya dari pengguna yang sudah memakainya.
  **Belum diputuskan** — harus dijawab sebelum ronde 4: biarkan gratis, atau
  kunci hanya untuk akun baru.

## 4. Keputusan yang sudah dijawab

| Pertanyaan                                                | Jawaban         |
| --------------------------------------------------------- | --------------- |
| Pendaftar lewat undangan juga dibuatkan ruang kerja solo? | Tidak           |
| Free boleh sampai 3 anggota?                              | Ya              |
| Jarak antara arsip dan hapus                              | 90 hari         |
| Undangan pertama di Free: peringatan atau pilihan pisah?  | Peringatan saja |
| Berapa organisasi yang bisa diikuti di awal?              | Satu            |

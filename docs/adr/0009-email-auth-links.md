# 0009. Tautan email lewat token hash, organisasi dibuat saat login pertama yang terverifikasi

- **Status:** Accepted
- **Date:** 2026-09-28

## Context

Project hosted mewajibkan konfirmasi email (`mailer_autoconfirm: false`), tapi
alur daftar ditulis seolah-olah tidak. Hasilnya, daftar pakai email dan password
**tidak pernah bisa selesai**:

1. `signUp` tidak mengirim `emailRedirectTo`, jadi tautan konfirmasi mendarat di
   Site URL (landing page) dengan `?code=` yang tidak ditukar siapa pun.
2. Email-nya terverifikasi, tapi organisasi tidak pernah dibuat. Login dengan
   password berikutnya berakhir di "Akun kamu belum punya organisasi. Hubungi
   admin." tanpa jalan keluar.
3. Nama organisasi yang diketik di form hanya hidup di form itu.
4. Tautan PKCE (`?code=`) hanya bisa ditukar di browser yang memulai alurnya,
   karena verifier-nya ada di cookie browser itu. Email yang dibuka di HP gagal.

Stack lokal mematikan konfirmasi secara default, jadi semua ini tidak pernah
terlihat saat development.

Reset password belum ada sama sekali.

## Decision

1. **Tautan email memakai `token_hash`, ditebus di server oleh `/confirm`.**
   Template di `supabase/templates/` menaut ke
   `{{ .SiteURL }}/confirm?token_hash={{ .TokenHash }}&type=…`, dan `/confirm`
   memanggil `verifyOtp`. Tidak ada yang bergantung pada browser pengirim, jadi
   tautan jalan di perangkat mana pun. `/confirm` tetap menerima `?code=` dari
   template bawaan Supabase, supaya project yang templatenya belum diganti tetap
   jalan (di browser yang sama).
2. **Organisasi dibuat saat login pertama yang terverifikasi, bukan saat daftar.**
   Nama yang diketik disimpan di `user_metadata.organization_name` ketika
   `signUp`, lalu `completeSignIn()` di `modules/auth` membuatnya. Fungsi itu
   idempoten dan dipanggil dari ketiga pintu masuk: `/callback` (Google),
   `/confirm` (email), dan login password (lewat `POST /api/auth/provision`).
   Akun yang terlanjur tidak punya organisasi diperbaiki di login berikutnya.
3. **Reset password memakai sesi pemulihan Supabase.** `/forgot-password` →
   email → `/confirm?type=recovery` (membuat sesi) → `/reset-password`
   (`updateUser({ password })`, lalu `signOut({ scope: 'others' })`). Form
   lupa-password memberi jawaban yang sama untuk email terdaftar dan tidak.
4. **Semua `?next=` lewat `safeNextPath()`** (`lib/security/`). Sebelumnya
   halaman login menerima `//evil.test`, dan `/callback` menerima `/\evil.test`.

## Consequences

- (+) Daftar pakai email bisa selesai, di perangkat mana pun, dengan nama
  organisasi yang diketik pengguna.
- (+) Satu jalur provisioning untuk tiga pintu masuk; akun yang terdampar
  memperbaiki dirinya sendiri.
- (−) Template email sekarang bagian dari kode. Mengubah path `/confirm` berarti
  mengubah template di dashboard Supabase juga — langkahnya di
  `docs/auth-setup.md`.
- (−) Login password menambah satu request (`/api/auth/provision`), yang untuk
  hampir semua orang hanya satu `select`.
- (−) `user_metadata` bisa ditulis pengguna, jadi nama organisasi di sana
  divalidasi ulang di server, tidak dipercaya begitu saja.
- (−) Email sungguhan butuh SMTP sendiri (Resend). Pengirim bawaan Supabase
  hanya mengirim ke anggota tim project dan dibatasi sangat ketat.

## Alternatives considered

- **Tetap PKCE `?code=` dengan `emailRedirectTo` saja.** Paling kecil
  perubahannya, tapi tautan gagal begitu dibuka di perangkat lain — dan untuk
  pengurus OSIS itu kasus paling umum (daftar di laptop sekolah, buka email di HP).
- **Membuat organisasi saat `signUp` lewat trigger database.** Menghilangkan
  langkah provisioning di app, tapi memindahkan logika bisnis (slug, retry,
  rollback) ke PL/pgSQL dan membuat organisasi untuk email yang tidak pernah
  diverifikasi.
- **Mematikan konfirmasi email.** Menghapus masalahnya dengan menghapus
  jaminannya: siapa pun bisa mendaftar memakai email orang lain.

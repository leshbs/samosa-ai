# Setup auth: Supabase, Resend, Google

Kode auth (ADR-0009) bergantung pada beberapa setelan yang hidupnya di dashboard,
bukan di repo. Tanpa langkah-langkah ini, alurnya sudah benar tapi emailnya
tidak sampai atau tautannya mendarat di tempat yang salah.

Kerjakan urut. Setiap langkah punya cara mengeceknya.

---

## 1. Resend (pengirim email)

Pengirim bawaan Supabase **hanya mengirim ke alamat anggota tim project** dan
dibatasi beberapa email per jam. Pengguna sungguhan tidak akan menerima email
verifikasi maupun reset sampai SMTP sendiri dipasang.

1. Daftar di [resend.com](https://resend.com), lalu **Domains → Add Domain**.
   Pakai subdomain khusus, misalnya `mail.domainmu.id`.
2. Tambahkan record DNS (SPF, DKIM, dan MX untuk bounce) yang ditampilkan Resend
   di pengelola DNS domain. Tunggu sampai statusnya **Verified**.
3. **API Keys → Create API Key**, izin _Sending access_ saja, dibatasi ke domain
   tadi. Simpan kuncinya — hanya ditampilkan sekali.

Batas paket gratis Resend saat dokumen ini ditulis: 3.000 email per bulan,
100 per hari. Cukup untuk pilot; cek ulang sebelum dipakai banyak organisasi.

## 2. Supabase → Authentication → Emails → SMTP Settings

| Field        | Isi                         |
| ------------ | --------------------------- |
| Enable SMTP  | On                          |
| Sender email | `no-reply@mail.domainmu.id` |
| Sender name  | `SAMOSA`                    |
| Host         | `smtp.resend.com`           |
| Port         | `465`                       |
| Username     | `resend`                    |
| Password     | API key dari langkah 1.3    |

Lalu **Authentication → Rate Limits**: naikkan batas email per jam (defaultnya
dibuat untuk pengirim bawaan). 30 per jam cukup untuk pilot.

## 3. Supabase → Authentication → URL Configuration

- **Site URL:** URL produksi, misalnya `https://samosa.domainmu.id`. Template
  email menaut ke `{{ .SiteURL }}/confirm`, jadi ini **harus** alamat app.
- **Redirect URLs:** tambahkan
  - `http://localhost:3000/**`
  - `https://samosa.domainmu.id/**`
  - URL preview Vercel kalau dipakai, misalnya `https://*-namatim.vercel.app/**`

`NEXT_PUBLIC_APP_URL` di env deployment harus sama dengan Site URL.

## 4. Supabase → Authentication → Emails → Templates

Salin isi file berikut ke template yang sesuai (bagian di dalam `<!-- -->` di
atasnya boleh ikut, email client mengabaikannya):

| Template       | Subject                        | File                                   |
| -------------- | ------------------------------ | -------------------------------------- |
| Confirm signup | `Konfirmasi email akun SAMOSA` | `supabase/templates/confirmation.html` |
| Reset password | `Atur ulang password SAMOSA`   | `supabase/templates/recovery.html`     |

Template ini menaut ke `/confirm?token_hash=…`, bukan `{{ .ConfirmationURL }}`
bawaan — itu yang membuat tautannya jalan di perangkat lain (ADR-0009).

## 5. Supabase → Authentication → Providers / Sign In

- **Email:** _Confirm email_ **On**. _Minimum password length_ **8** (sama dengan
  form). _Secure email change_ On.
- **Google:** sudah On. Client ID dan secret dari langkah 6.

## 6. Google Cloud Console

1. **APIs & Services → Credentials → OAuth 2.0 Client ID** yang dipakai:
   _Authorized redirect URIs_ harus berisi
   `https://<project-ref>.supabase.co/auth/v1/callback` (bukan URL app).
2. **OAuth consent screen → Publishing status: In production.** Selama masih
   _Testing_, hanya akun yang terdaftar sebagai _test user_ yang bisa masuk
   dengan Google; yang lain ditolak Google sebelum sampai ke kita.

## 7. Cek

1. Daftar dengan email sungguhan yang **bukan** anggota tim Supabase.
2. Email "Konfirmasi email akun SAMOSA" datang dari domainmu, dalam bahasa
   Indonesia.
3. Buka tautannya **di perangkat lain** (misalnya HP) → langsung masuk ke
   dashboard, dengan nama organisasi yang diketik saat daftar.
4. Keluar → **Lupa password?** → email "Atur ulang password SAMOSA" datang →
   tautannya membuka "Atur password baru" → simpan → masuk dengan password baru.
5. Masuk dengan Google dari akun yang bukan _test user_.

Kalau langkah 3 mendarat di landing page, Site URL atau template belum diganti.
Kalau muncul "Tautan ini tidak bisa dipakai di browser ini", template masih yang
bawaan Supabase.

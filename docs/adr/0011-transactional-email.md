# 0011. Email transaksional lewat HTTP API Resend, mati sampai dikonfigurasi

- **Status:** Accepted
- **Date:** 2026-09-29

## Context

Fase ini menambah tiga email yang dikirim aplikasi sendiri, bukan oleh Supabase
Auth: undangan anggota (5.3), pemberitahuan serah terima kepemilikan ke kedua
pihak (5.2), dan "analisis selesai" ke orang yang menjalankannya (5.6).

Belum ada domain pengirim (`docs/auth-setup.md` §0), jadi hari ini tidak ada
email yang bisa dikirim. Kode yang bergantung pada email tetap harus benar dan
teruji, dan UI tidak boleh menjanjikan email yang tidak akan datang.

## Decision

1. **Resend lewat `fetch`, tanpa SDK.** Satu endpoint, satu payload. Resend juga
   akun yang dipakai `docs/auth-setup.md` sebagai SMTP Supabase, jadi menyalakan
   email berarti satu domain untuk keduanya.
2. **Modul baru `modules/notifications`** berisi transport dan template. Modul ini
   tidak bergantung pada modul lain; komposisinya (baca job → cari penerima →
   render → kirim) ada di `app/api/_lib/notify.ts`, sama seperti
   `run-analysis.ts` menyusun analysis dan reporting.
3. **`RESEND_API_KEY` dan `EMAIL_FROM` opsional, keduanya atau tidak sama
   sekali.** Tanpa keduanya `isEmailConfigured()` bernilai `false`: pengiriman
   dilewati dan dicatat, tab Notifikasi mengatakan email belum aktif, dan
   form undangan menampilkan tautan untuk dibagikan sendiri.
4. **Email tidak pernah membatalkan hal yang diumumkannya.** Setiap pemanggil
   menelan kegagalannya: undangan tetap dibuat, kepemilikan tetap berpindah,
   job tetap selesai. Respons API menyebut hasilnya (`sent` / `off` /
   `failed`) supaya UI bisa jujur.
5. **Alamat penerima tidak pernah masuk log** — hanya jenis email dan status.

## Consequences

- Menyalakan email tidak butuh perubahan kode: isi dua env var, redeploy.
- Hari ini notifikasi 5.6 tersimpan sebagai preferensi tapi tidak mengirim apa
  pun; DoD-nya ("menutup tab tidak berarti kehilangan hasil") dipenuhi oleh
  daftar Analisis dan halaman laporan, bukan oleh email.
- Job yang ditandai gagal oleh sweeper harian tidak memicu email — sweeper tidak
  lewat `runAnalysisJob`. Dicatat di `DEBT.md`.

## Alternatives considered

- **SMTP lewat Nodemailer.** Dependensi lebih besar, koneksi SMTP di serverless
  lebih rapuh, dan tidak ada yang tidak bisa dilakukan HTTP API.
- **Email lewat Supabase Auth (`inviteUserByEmail`).** Hanya untuk undangan,
  membuat user sebelum ia setuju bergabung, dan tetap butuh SMTP yang sama.
- **Menunggu domain sebelum membangun apa pun.** Semua kode email akan ditulis
  dan diuji terburu-buru di hari domain datang.

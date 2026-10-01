# 0010. Akses tim: undangan lewat tautan, satu organisasi per akun, keanggotaan dijaga database

- **Status:** Accepted — butir 1 digantikan oleh
  [ADR-0012](0012-accounts-and-workspaces.md) (berlaku sejak ronde 2 selesai)
- **Date:** 2026-09-29

## Context

Sampai fase ini satu organisasi dipakai satu akun. Checklist 5.2–5.3 meminta
orang kedua bisa bekerja tanpa meminjam password pemilik, dan pemilik yang lulus
bisa menyerahkan organisasi tanpa bantuan siapa pun. Tiga hal yang sudah ada
membatasi bentuk solusinya:

1. **`getSessionUser()` mengasumsikan satu keanggotaan** (`.limit(1)` tanpa
   urutan). Setiap alur daftar juga langsung membuat organisasi baru
   (ADR-0009), jadi orang yang diundang hampir pasti sudah punya organisasinya
   sendiri — kosong — saat membuka tautan undangan.
2. **Policy `members_manage` bocor begitu ada anggota kedua.** Policy itu
   `for all` untuk owner dan admin, jadi seorang admin bisa mengubah barisnya
   sendiri jadi `owner`, atau menghapus baris pemilik. Aman selama setiap
   organisasi punya satu anggota; tidak aman sejak undangan ada.
3. **Belum ada domain pengirim email** (`docs/auth-setup.md` §0). Undangan yang
   hanya bisa dikirim lewat email tidak bisa dipakai sama sekali hari ini.

## Decision

1. **Satu akun, satu organisasi — tetap.** Menerima undangan memindahkan akun ke
   organisasi yang mengundang. Organisasi lama ikut dihapus **hanya kalau
   kosong**: akun itu pemiliknya, tidak ada anggota lain, tidak ada dataset.
   Selain itu penerimaan ditolak (`membership_conflict`) dengan kalimat yang
   menjelaskan jalan keluarnya. Pindah-pindah organisasi (org switcher) tidak
   dibuat.
2. **Undangan adalah tautan berisi token acak 256-bit; database hanya menyimpan
   SHA-256-nya.** Tautan ditampilkan sekali ke pengundang dan tetap berfungsi
   tanpa email, jadi bisa dibagikan lewat grup WhatsApp. Kalau email aktif,
   tautan yang sama juga dikirim. Satu tautan untuk satu alamat email, berlaku
   7 hari, dan hanya bisa dipakai akun dengan email itu.
3. **Perubahan keanggotaan yang multi-langkah adalah fungsi Postgres
   `security definer`**: `accept_organization_invitation` (hapus organisasi
   kosong + tambah keanggotaan + tandai undangan, satu transaksi) dan
   `transfer_organization_ownership` (tukar dua peran, satu transaksi, jadi
   tidak pernah ada dua pemilik atau nol). Keduanya membaca `auth.uid()`
   sendiri, bukan parameter.
4. **Kolom yang tidak boleh ditulis browser dikunci dengan column privilege**,
   bukan hanya dengan kode: `organization_members` hanya `role` yang bisa di-
   update, `organizations.logo_path` dan `profiles.avatar_path` tidak bisa
   ditulis anon key sama sekali, `token_hash` tidak bisa dibaca. RLS menjaga
   _baris mana_; privilege menjaga _kolom mana_.
5. **Baris pemilik tidak bisa disentuh lewat RLS**, oleh siapa pun termasuk
   pemiliknya sendiri. Kepemilikan hanya berpindah lewat fungsi transfer;
   pemilik lama tetap sebagai Admin.
6. **`organizations_update` jadi owner-only**, sama dengan `can(role,
'org:manage')`. Ini melunasi utang "RLS organisasi lebih longgar dari policy
   modul".

## Consequences

- Admin yang disusupi tidak bisa menaikkan dirinya jadi pemilik, mengeluarkan
  pemilik, atau memindahkan baris keanggotaan ke organisasi lain — diverifikasi
  dengan 57 cek di PGlite (`pnpm db:check`) dan dengan `scripts/check-rls.mjs` terhadap project
  hosted.
- Orang yang sudah punya organisasi berisi data tidak bisa bergabung ke
  organisasi lain tanpa menyerahkan atau menghapus miliknya dulu. Untuk OSIS
  (satu orang, satu kepengurusan) ini jarang; untuk pembina yang mendampingi
  beberapa organisasi, ini membatasi. Dicatat di `DEBT.md`.
- Anggota yang dikeluarkan — atau yang organisasinya dihapus — tetap punya
  akun. Selama sesinya masih hidup, dashboard mengarahkannya ke
  `/no-organization`: halaman yang menjelaskan sebabnya, mengingatkan bahwa
  tautan undangan tetap bisa dipakai, dan menawarkan membuat organisasi sendiri
  lewat `/api/auth/provision`. Login berikutnya juga membuatkannya organisasi
  baru lewat jalur perbaikan ADR-0009.
- Email anggota lain dibaca dari `auth.users` dengan service role, satu panggilan
  per anggota, hanya untuk user id yang dikembalikan query ber-RLS. Wajar untuk
  selusin pengurus; perlu diganti kalau organisasi punya ratusan anggota.

## Alternatives considered

- **Banyak organisasi per akun dengan pemilih organisasi.** Model yang benar
  untuk jangka panjang, tapi menyentuh setiap query yang sekarang mengandalkan
  RLS `current_org_ids()` + satu keanggotaan, dan butuh "organisasi aktif" di
  sesi. Terlalu besar untuk kebutuhan fase ini.
- **Menunda undangan sampai email aktif.** Membuat DoD 5.3 tidak bisa dipenuhi
  sama sekali selama belum ada domain.
- **Token undangan disimpan apa adanya.** Lebih sederhana, tapi bocornya tabel
  langsung jadi akses ke semua undangan yang belum dipakai.
- **Transfer dan penerimaan di kode aplikasi dengan service role.** Dua update
  lewat PostgREST tidak satu transaksi; kegagalan di tengah meninggalkan dua
  pemilik atau organisasi tanpa pemilik.

# 0012. Akun, ruang kerja, dan keanggotaan yang menambah — bukan memindahkan

- **Status:** Accepted — ronde 1–4 diimplementasikan (butir 1–9); sisanya
  dikerjakan bertahap menurut [`docs/workspace-plan.md`](../workspace-plan.md)
- **Date:** 2026-10-01
- **Menggantikan sebagian:** ADR-0009 butir 2 (organisasi dibuat di setiap pintu
  masuk) dan ADR-0010 butir 1 (satu akun, satu organisasi)

## Context

Dua keputusan lama mulai saling menjegal begitu undangan anggota ada:

1. **Setiap pintu masuk membuat organisasi** (ADR-0009). Orang yang diundang
   hampir selalu sudah punya organisasi kosong atas namanya sendiri saat membuka
   tautan undangan.
2. **Satu akun hanya boleh di satu organisasi** (ADR-0010). Jadi menerima
   undangan harus _memindahkan_ akun: organisasi lamanya dihapus diam-diam kalau
   kosong, dan ditolak (`membership_conflict`) kalau berisi data.

Akibatnya bergabung adalah operasi yang bisa menghapus sesuatu, dan orang yang
sudah mencoba SAMOSA sendirian sebelum diundang justru yang paling sulit
bergabung. Pembina yang mendampingi dua organisasi harus memakai dua akun.

Di luar itu belum ada tempat untuk menaruh paket dan batasnya. Menaruhnya di
`organizations` berarti satu orang yang punya beberapa organisasi membayar
beberapa kali, dan batas "jumlah organisasi" tidak punya pemilik.

Yang sudah ada dan membatasi bentuk solusinya:

- `organization_members` sudah berupa tabel penghubung (PK `user_id,
organization_id`), dan `current_org_ids()` sudah mengembalikan himpunan. RLS
  tidak mengasumsikan satu keanggotaan.
- Yang mengasumsikannya adalah kode: `getSessionUser()` mengambil satu
  keanggotaan dengan `.limit(1)`, dan beberapa query (misalnya `listJobs()`)
  tidak memfilter organisasi sama sekali — mereka mengandalkan RLS. Begitu satu
  akun punya dua keanggotaan, query seperti itu mencampur data dua organisasi.
- Project hosted sudah berisi data, jadi setiap perubahan schema butuh backfill.

## Decision

1. **Tiga lapis: akun → ruang kerja → anggota.** Tabel baru `accounts` adalah
   satuan penagihan dan punya satu pemilik; `organizations.account_id` menunjuk
   ke sana. `organizations` tetap satuan isolasi data dan tetap satu-satunya
   yang dibaca RLS. "Pribadi" bukan tipe terpisah — itu ruang kerja dengan satu
   anggota.
2. **Paket hidup di akun, di samping jalur akses, bukan di dalamnya.**
   `accounts.plan` (`free` | `org` | `enterprise`), `accounts.limits jsonb`
   untuk pengecualian per akun, dan `billing_email`. Nilai default tiap paket
   ada di kode (`lib/plans.ts`). Policy RLS tidak membaca paket; batas paket
   diperiksa di service.
3. **Ruang kerja dibuat sekali per orang, bukan sekali per login.** Kedatangan
   pertama tanpa undangan mendapat satu ruang kerja solo, tanpa ditanya.
   Kedatangan pertama lewat undangan hanya bergabung ke organisasi yang
   mengundang — tidak dibuatkan ruang kerja solo. Login berikutnya tidak pernah
   membuat apa pun; orang tanpa ruang kerja melihat halaman sambutan.
4. **Bergabung itu menambah.** `accept_organization_invitation` tidak lagi
   menghapus organisasi kosong dan tidak lagi menolak dengan
   `membership_conflict`. Tidak ada jalur bergabung yang menghapus atau
   memindahkan data.
5. **Untuk sekarang: satu ruang kerja yang dimiliki plus satu yang diikuti.**
   Menerima undangan kedua berarti mengonfirmasi keluar dari yang pertama. Batas
   ini aturan produk di service, bukan batasan schema.
6. **Sesi membawa "ruang kerja aktif"**, dan setiap query memfilternya secara
   eksplisit. RLS tetap batas keamanan antar-tenant; filter eksplisit adalah
   batas antar-ruang-kerja milik orang yang sama, yang tidak bisa dijaga RLS.
7. **Kata "organisasi" disembunyikan selama ruang kerja masih solo.** Anggota,
   peran, dan nama organisasi baru muncul saat undangan pertama dibuat. Pada
   paket Free, undangan pertama menampilkan peringatan saja — berapa dataset dan
   laporan yang akan terlihat anggota — tanpa pilihan "buat organisasi
   terpisah".
8. **Yang tidak pernah dikunci paket:** kualitas analisis, export, dan serah
   terima kepemilikan. Tidak ada harga per kursi di bawah Enterprise, dan tidak
   ada batas volume yang terlihat pengguna — hanya batas penyalahgunaan yang
   tidak diiklankan.
9. **Retensi mengikuti paket dan tidak pernah langsung menghapus.** Peringatan
   30 dan 7 hari sebelumnya, lalu arsip (tersembunyi, masih bisa diexport,
   pulih kalau upgrade), lalu hapus 90 hari setelah diarsipkan. Jam untuk data
   yang sudah ada mulai dihitung sejak diumumkan, dan halaman privasi diubah
   lebih dulu.

Isi paket, urutan pengerjaan, dan risikonya ada di
[`docs/workspace-plan.md`](../workspace-plan.md).

## Consequences

- Menerima undangan tidak bisa lagi menghilangkan apa pun. Dua jalur yang paling
  sulit dijelaskan ke pengguna — hapus diam-diam dan `membership_conflict` —
  hilang.
- **Risiko terbesar pindah ke audit query.** Setiap query yang hari ini hanya
  mengandalkan RLS menjadi kebocoran antar-ruang-kerja begitu satu akun punya
  dua keanggotaan. Ronde 1 tidak selesai sampai `scripts/check-rls.mjs` punya
  pengguna dengan dua ruang kerja dan pengguna itu tidak pernah melihat data
  tercampur.
- `getSessionUser()` berubah bentuk: ia memilih keanggotaan dari ruang kerja
  aktif, bukan `.limit(1)`. Semua pemanggil `session.organizationId` tetap
  jalan, tapi artinya berubah dari "organisasi akun ini" menjadi "ruang kerja
  yang sedang dibuka".
- Bucket rate limit (`"<action>:<organization_id>"`) tetap per ruang kerja;
  batas penyalahgunaan bulanan dihitung per akun.
- Serah terima satu-satunya ruang kerja milik sebuah akun ikut memindahkan
  akunnya; kalau tidak, pemilik lama tetap ditagih untuk ruang kerja yang bukan
  miliknya lagi.
- Penagihan manual: paket diubah dengan tangan di database. Cukup untuk pilot;
  tidak cukup begitu ada lebih dari segelintir pelanggan berbayar.
- Retensi satu tahun di paket Free mengubah janji "dataset disimpan sampai kamu
  menghapusnya" di `/privacy` dan tabel retensi di
  `docs/pilot-data-posture.md`. Keduanya harus diubah sebelum jamnya berjalan.
- ADR-0009 butir 2 dan ADR-0010 butir 1 tetap menggambarkan kode yang berjalan
  sampai ronde 2 selesai.

## Catatan implementasi (ronde 2, 2026-10-02)

- **"Kedatangan pertama" ditandai oleh baris `profiles`**, yang ditulis paling
  akhir. Tanpa kolom baru, jadi tidak ada migrasi yang harus mendahului deploy;
  kedatangan pertama yang gagal di tengah jalan diulang pada login berikutnya.
- **"Lewat undangan" dibaca dari `next`** (`/invite/…`) di `/callback`,
  `/confirm`, dan formulir masuk/daftar. Petunjuk dari browser itu aman
  dipercaya: yang bisa dilakukannya hanya _menahan_ pembuatan ruang kerja, yang
  ditawarkan lagi di `/welcome`.
- **Keluar-lalu-bergabung satu transaksi.** Ruang kerja yang ditinggalkan
  ditentukan server (`findWorkspaceToLeave`), bukan dikirim browser; fungsi
  database menolak kalau itu ruang kerja milik pemanggil.
- **Keluar lewat policy RLS** (`members_leave`: baris sendiri, bukan pemilik),
  bukan fungsi baru.
- **Nama yang sudah keluar** tetap terbaca lewat `profiles_select`: profil
  terbaca oleh anggota ruang kerja tempat orang itu pernah menjalankan analisis.

## Catatan implementasi (ronde 3, 2026-10-02)

- **"Solo" diturunkan, tidak disimpan:** satu anggota dan tidak ada undangan
  yang belum dipakai atau dibatalkan. Hitungan yang gagal dibaca berarti "bukan
  solo" — menampilkan lebih banyak dari yang perlu, bukan menyembunyikan
  anggota dari sebuah tim.
- **Undangan yang menunggu memakai satu tempat.** Orang keempat mendengar
  "tidak" saat diundang, bukan seminggu kemudian saat membuka tautannya.
- **Satu akun per orang menang atas "akun ikut pindah".** Kalau penerima serah
  terima sudah punya akun, ruang kerjanya yang pindah ke akun itu, bukan
  akunnya yang berpindah tangan.
- **Logo di PDF tetap gratis** (butir 8 bertambah satu). Fiturnya sudah dipakai
  sebelum paket ada; menguncinya berarti mengambilnya dari pengguna.

## Catatan implementasi (ronde 4, 2026-10-03)

- **Yang disimpan hanya yang tidak bisa dihitung ulang:** kapan jam sebuah
  dataset mulai, kapan ia diarsipkan, dan sejauh mana pemiliknya sudah
  dikabari. Tenggatnya sendiri selalu dihitung dari paket saat itu, jadi
  mengganti paket langsung mengubah tenggat tanpa migrasi data.
- **Pemberitahuan adalah syarat, bukan efek samping.** Sweep hanya memajukan
  sebuah dataset setelah email untuk langkah itu terkirim, dan tanpa email
  terkonfigurasi ia tidak mengarsipkan atau menghapus apa pun.
- **Paket yang tidak terbaca berarti "jangan sentuh"** di sweep, kebalikan dari
  halaman (yang jatuh ke paket Gratis): di sweep kesalahan yang harus dihindari
  adalah mengarsipkan karena tebakan.
- **Serah terima ke orang yang sudah punya akun mengikuti paket penerima** —
  diputuskan tetap begitu, dengan akibat masa simpannya dicatat di `DEBT.md`.

## Alternatives considered

- **Tanpa organisasi setelah daftar; pengguna memilih "buat" atau "gabung".**
  Paling jujur secara model, tapi menaruh keputusan soal struktur di depan orang
  yang baru ingin mengunggah satu CSV. Ruang kerja solo yang dibuat diam-diam
  memberi hasil yang sama tanpa pertanyaannya.
- **Dua sistem terpisah, Pribadi dan Organisasi.** Dua tipe berarti dua jalur
  kode untuk fitur yang hampir sama, dan migrasi data saat seseorang "naik" dari
  pribadi ke organisasi. Satu tipe dengan jumlah anggota berbeda tidak punya
  migrasi itu.
- **Paket di `organizations`.** Lebih sedikit tabel, tapi batas jumlah
  organisasi tidak punya tempat, dan satu pelanggan dengan tiga organisasi jadi
  tiga langganan.
- **Tetap satu organisasi per akun, perbaiki hanya pesan konfliknya.** Tidak
  menyentuh audit query, tapi bergabung tetap operasi yang bisa menghapus, dan
  pembina dua organisasi tetap butuh dua akun.
- **Banyak organisasi yang diikuti sejak awal.** Schema-nya sudah mengizinkan;
  yang belum siap adalah pemilih ruang kerja dan aturan notifikasi. Ditunda ke
  ronde 5, tanpa perubahan schema.
- **Harga per kursi atau kuota analisis yang terlihat.** Keduanya membuat
  pengurus OSIS menghitung sebelum mengundang atau menganalisis. Biaya nyata
  per aspirasi (≈ Rp 0,80) terlalu kecil untuk layak dijadikan gesekan.

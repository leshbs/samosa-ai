# Sikap data untuk pilot

**Disusun:** 2026-09-25
**Berlaku untuk:** pilot pertama dengan pengguna nyata, sebelum rilis umum.

Dokumen ini memutuskan lebih dulu apa yang boleh terjadi pada data pilot,
supaya kebijakan privasi di `/privacy` menggambarkan perilaku yang sudah
benar-benar ada di kode — bukan janji yang dibuat belakangan.

Kenapa dokumen ini ada: data pilot adalah aspirasi siswa sungguhan, sebagian
besar **di bawah 18 tahun**, yang **mengisi formulirnya sebelum SAMOSA ada**.
Mereka tidak pernah diberi tahu teksnya akan dikirim ke API model bahasa. Itu
fakta yang tidak bisa diperbaiki oleh fitur, hanya oleh cara memperlakukannya.

---

## 1. Minimisasi — sudah jalan di kode

Sejak commit ini, `extractResponses` **membuang semua kolom selain kolom
aspirasi** kecuali diminta secara eksplisit
([`dataset-validator.ts`](../modules/ingestion/validators/dataset-validator.ts)).
Wizard unggah menampilkan daftar kolom lain dengan kotak centang yang **kosong
secara default**, jadi nama, kelas, dan email tidak ikut tersimpan kecuali ada
orang yang sengaja mencentangnya.

Sebelumnya kebalikannya: seluruh kolom non-teks disimpan otomatis sebagai
`respondent_meta`. Tidak ada satu pun bagian pipeline yang membacanya.

Kolom yang dipilih untuk disimpan dicatat di `datasets.metadata.kept_columns`,
jadi pertanyaan "dataset ini menyimpan data pribadi apa" bisa dijawab tanpa
membuka barisnya.

**Yang masih tersimpan utuh:** file CSV/Excel aslinya, di bucket `datasets`,
lengkap dengan kolom yang dibuang tadi. Ini disengaja — tanpa file asli, hasil
analisis tidak bisa ditelusuri ulang kalau dipertanyakan. File itu ikut terhapus
saat datasetnya dihapus (`removeDatasetObject`), dan itu satu-satunya salinan
yang memuat nama.

**Konsekuensinya untuk pilot:** hapus dataset setelah evaluasi selesai, dan nama
siswa hilang dari sistem sepenuhnya. Itu satu tombol, bukan proyek.

## 2. Retensi

| Data                        | Disimpan sampai                               |
| --------------------------- | --------------------------------------------- |
| File unggahan asli (CSV)    | dataset dihapus, atau masa simpan paket habis |
| Teks aspirasi (`responses`) | dataset dihapus, atau masa simpan paket habis |
| Hasil analisis + laporan    | mengikuti datasetnya (cascade)                |
| Data akun pengurus OSIS     | akun dihapus manual                           |

**Masa simpan per paket** (ADR-0012, `lib/plans.ts`): Gratis satu tahun sejak
`datasets.retention_clock_at`; Organization dan Enterprise permanen. Untuk
dataset yang sudah ada saat `20261003000100_retention.sql` ditempel, jamnya
mulai saat itu, bukan saat diunggah.

Habisnya masa simpan tidak langsung menghapus. Sweep harian
(`/api/cron/retention`) berjalan satu langkah per hari per dataset:

1. email ke pemilik 30 hari sebelum tenggat, lalu 7 hari sebelumnya;
2. pada tenggat, dan paling cepat 7 hari setelah email kedua terkirim:
   **diarsipkan** — `archived_at` diisi, hilang dari semua halaman, masih ikut
   di unduhan arsip organisasi;
3. 90 hari setelah pemilik dikabari bahwa datanya diarsipkan: **dihapus**,
   termasuk file unggahannya.

Setiap langkah hanya terjadi **setelah emailnya benar-benar terkirim**. Tanpa
`RESEND_API_KEY` dan `EMAIL_FROM`, sweep tidak mengarsipkan dan tidak menghapus
apa pun; peringatan hanya muncul di dalam aplikasi. Akun yang pindah ke paket
dengan masa simpan permanen mendapatkan kembali dataset yang masih di arsip
pada sweep berikutnya.

**Untuk pilot ini:** seluruh dataset pilot dihapus paling lambat
**2026-10-31**, setelah evaluasi selesai dan catatan temuannya ditulis. Yang
disimpan setelah tanggal itu hanya angka agregat di `docs/research/` — jumlah
aspirasi, biaya, akurasi label — tanpa satu pun teks aspirasi asli.

> Tanggal ini perlu dikonfirmasi pemilik projek. Kalau evaluasi mundur,
> mundurkan tanggalnya di sini **sebelum** tanggalnya lewat, bukan sesudah.

## 3. Akses

Siapa yang bisa melihat teks aspirasi mentah selama pilot:

- **Pengurus OSIS yang mengunggah**, lewat organisasinya sendiri. RLS membatasi
  ini per organisasi — sudah diverifikasi, 14/14 probe lulus
  ([`check-rls.mjs`](../scripts/check-rls.mjs)).
- **Pemilik projek**, lewat service role key, untuk menyelidiki kegagalan.
  Akses ini tidak punya jejak audit; dipakai hanya kalau ada yang rusak.

Yang **tidak** punya akses: anggota organisasi lain, pengguna yang belum masuk,
dan siapa pun tanpa kredensial Supabase.

## 4. Pihak ketiga

Teks aspirasi **dikirim ke OpenAI di Amerika Serikat** untuk dianalisis.
Aplikasi tidak bisa bekerja tanpa itu. Yang dikirim hanya kolom teksnya —
`respondent_meta` tidak pernah ikut, dan sejak perubahan di atas isinya kosong
kecuali ada yang sengaja mengisinya.

Daftar lengkap pemroses ada di [`lib/legal/controller.ts`](../lib/legal/controller.ts)
dan tampil di `/privacy`: Supabase (Tokyo), OpenAI (AS), Vercel (CDN global).

## 5. Pemberitahuan ke responden

Aspirasi pilot dikumpulkan sebelum SAMOSA ada, jadi tidak mungkin meminta
persetujuan di muka. Yang bisa dilakukan adalah memberi tahu sekarang, sebelum
analisisnya dipakai untuk apa pun.

Minta pengurus OSIS menyampaikan paragraf ini — lewat grup angkatan, mading,
atau pengumuman kelas, mana pun yang benar-benar terbaca:

> **Soal aspirasi yang kalian isi kemarin.**
> Aspirasi yang kalian tulis di formulir OSIS akan kami olah pakai alat bantu
> bernama SAMOSA, supaya bisa dikelompokkan per topik dan ketahuan mana yang
> paling sering disebut. Isi tulisannya dikirim ke layanan AI di luar negeri
> untuk dibaca otomatis — **nama, kelas, dan email kalian tidak ikut dikirim dan
> tidak kami simpan.** Yang kami simpan cuma isi aspirasinya. Hasilnya berupa
> rangkuman, bukan daftar siapa menulis apa. Kalau kamu tidak mau aspirasimu
> ikut diolah, bilang ke [nama pengurus] sebelum [tanggal] dan akan kami
> keluarkan.

Dua bagian yang jangan dihapus saat mengeditnya: kalimat bahwa teksnya dikirim
ke layanan luar negeri, dan cara menarik diri. Sisanya boleh disesuaikan
gayanya.

## 6. Yang belum beres

- **`lib/legal/controller.ts` masih placeholder.** Empat nilai — nama
  penanggung jawab, email kontak, alamat surat, yurisdiksi — masih `TODO`, dan
  `/privacy` menampilkannya apa adanya ke pengunjung. Banner merah muncul selama
  itu terjadi. Ini butuh identitas sungguhan, jadi tidak bisa diisi dari sini.
- **Tidak ada jejak audit untuk akses service role.** Tercatat, tidak dibayar;
  untuk pilot satu organisasi, risikonya lebih kecil daripada kerumitannya.

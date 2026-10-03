# 0016. Mode analisis per pertanyaan

- **Status:** Accepted
- **Date:** 2026-10-03

## Context

Pilot 01 ([temuan §3.1 dan §4](../research/pilot-01-findings.md)): pipeline
menganggap setiap kolom teks berisi aspirasi dan meminta sentimen untuk semuanya.
"Kegiatan apa yang paling seru?" menghasilkan 100% netral — model menjawab benar
untuk pertanyaan yang salah. Putaran 1 ([ADR-0015](0015-questions-per-dataset.md))
memberi dataset pertanyaan; putaran ini memberi tiap pertanyaan cara baca.

Tiga hal di kode tidak sesuai dengan rancangan §4 dan mengubah keputusannya:

- `analysis_results.sentiment` dan `sentiment_confidence` adalah `NOT NULL`.
  "Tanpa field sentimen sama sekali" tidak bisa disimpan tanpa migrasi —
  ADR-0015 keliru menulis bahwa putaran ini tidak butuh migrasi.
- Halaman privasi dan landing berjanji hanya teks aspirasi yang dikirim ke
  OpenAI, "tanpa nama atau kolom lain". Deteksi di §4.2 mengirim tiga contoh
  nilai dari **setiap** kolom, sebelum pengunggah memilih kolom mana pun.
- Sekitar satu dari seratus balasan model melanggar skema keluaran (diukur di
  putaran 1), dan satu balasan batch yang rusak menggagalkan 30 jawaban.

## Decision

### Enam mode, empat di antaranya pertanyaan

`evaluative`, `thematic`, `categorical`, `scale`, `segment`, `ignore`
(`ANALYSIS_MODES`). Hanya empat yang pertama bisa menjadi pertanyaan dataset
(`QUESTION_MODES`); kolom `segment` dan `ignore` tidak disimpan sebagai jawaban.

| Mode          | Dibaca oleh | Yang disimpan per jawaban              | Bagian laporan                     |
| ------------- | ----------- | -------------------------------------- | ---------------------------------- |
| `evaluative`  | model       | sentimen, topik, kata kunci, ringkasan | sentimen, topik, kata kunci        |
| `thematic`    | model       | topik, kata kunci, ringkasan           | topik, kata kunci — tanpa sentimen |
| `categorical` | model       | pilihan yang disebut (di `topics`)     | jumlah per pilihan                 |
| `scale`       | **kode**    | nilai yang diberikan (di `topics`)     | sebaran, rata-rata, paling sering  |

### Sentimen boleh kosong; tidak ada kolom baru

Migrasi `20261006000100`: `sentiment` dan `sentiment_confidence` boleh `null`,
dengan check bahwa keduanya ada atau keduanya kosong. Aman ditempel saat kode
lama masih live — kode itu selalu menulis keduanya.

Kolom `topics` memuat apa yang dihitung mode itu: topik, pilihan, atau nilai.
Tidak dibuat kolom `values`, karena agregasi, filter penjelajah, dan ekspor
sudah bekerja di atas `topics` dan pilihan memang dihitung dengan cara yang
sama.

**Mode yang dipakai sebuah job dicatat di job**, bukan dibaca dari pertanyaan:
`analysis_jobs.question_counts[<id>].mode`. Laporan menggambar sesuai mode itu,
jadi laporan lama tidak berubah kalau mode pertanyaannya nanti diubah. Job tanpa
catatan mode dibaca sebagai `evaluative`.

### `analysis.v3`: satu prompt per mode, dengan teks pertanyaan

- Ketiga mode yang dibaca model menerima teks pertanyaan dalam blok
  `<pertanyaan>`.
- Keluaran `thematic` dan `categorical` **tidak punya field sentimen**; kalau
  model tetap mengisinya, skema membuangnya.
- `evaluative` menambah yang diminta C.3: permintaan sopan tetap keluhan,
  tulisan apa adanya (singkatan, gaul, campur bahasa), beberapa hal dalam satu
  jawaban.
- Batas keluaran (jumlah topik, panjang ringkasan) diterapkan dengan
  **memotong**, bukan menolak.
- Job dengan prompt sebelum v3 membaca semua pertanyaan sebagai `evaluative`
  (`effectiveMode`), sehingga menjalankan ulang dataset di `analysis.v2` tetap
  perbandingan yang sah.

### `scale` dibaca tanpa model

Angka adalah angka: `scaleValue` membaca "4", "8,5", "4/5", "4 dari 5", dan "5
bintang". Jawaban berupa kata ("sangat setuju") dihitung apa adanya dan tidak
masuk rata-rata. Likert berupa kata diarahkan ke `categorical`, yang menyatukan
ejaannya; rata-ratanya tidak dihitung karena skalanya tidak diketahui.

### Non-jawaban bergantung mode

"tidak" adalah non-jawaban di bawah "Ada saran?" dan jawaban di bawah "Ikut lagi
tahun depan?". Untuk `categorical` dan `scale` kamus hanya membuang yang benar-benar
kosong ("-", ".", "N/A"), dan batas minimal tiga karakter tidak berlaku.

### Batch `categorical` berurutan

Batch dianalisis terpisah, jadi "outbound" di batch pertama bisa menjadi
"kegiatan outbound" di batch kedua. Batch satu pertanyaan `categorical` dijalankan
berurutan dan tiap batch diberi daftar pilihan yang sudah dipakai batch
sebelumnya. Pertanyaan lain tetap berjalan paralel.

### Balasan rusak diulang sekali

Batch yang balasannya melanggar format diminta sekali lagi, seperti ringkasan
sejak putaran 1. Penyedia yang tidak terjangkau tidak diulang di sini — adapter
sudah mengulangnya.

### Deteksi: judul dan bentuk, bukan isi

`modes.v1` menerima judul tiap kolom dan gambaran isinya yang dihitung di server
(`profileColumns`): berapa sel terisi, berapa yang berbeda, rata-rata jumlah
kata, dan jenisnya (angka, teks pendek, teks panjang). **Tidak ada isi sel yang
dikirim.** Kolom yang isinya tanggal, email, atau nomor telepon diputuskan
aturan lokal dan judulnya pun tidak dikirim.

Judul yang menyebut masukan secara langsung ("Aspirasi", "Kritik dan saran",
"Masukan untuk OSIS") selalu `evaluative`: kalau model menjawab `thematic`
untuk judul seperti itu, aturan lokal menggantinya. Membaca keluhan tanpa
sentimen adalah kesalahan yang lebih mahal daripada sebaliknya, dan itu yang
terjadi saat diuji dengan judul yang hanya berupa label.

Deteksi tidak boleh menggagalkan unggahan: kalau model tidak menjawab dalam 8
detik atau gagal, tiap kolom ditebak aturan lokal (`guessModeByRule`).

Tebakan dan pilihan disimpan untuk semua kolom, termasuk yang tidak dipakai:
`dataset_questions.detected_mode` untuk pertanyaan, dan
`datasets.metadata.column_modes` untuk seluruh kolom (judul saja).

### Hitungan per pertanyaan ditulis sebelum ringkasan

Ringkasan dibuat di dalam hook `onResultsReady` dan membaca mode tiap
pertanyaan dari baris job. Runner karena itu menulis `question_counts` (dengan
mode) **sebelum** hook itu, bukan bersama status akhir. Saat urutannya terbalik,
ringkasan menganggap semua pertanyaan `evaluative` dan mengutip "4" sebagai bukti
— ditemukan dengan membaca PDF dari uji nyata, bukan oleh tes.

### `summary.v3`: per pertanyaan, menyebut asal

Ringkasan diberi laporan seperti yang digambar — pertanyaan demi pertanyaan,
dengan jenisnya — dan tiap insight menyebut nomor pertanyaan asalnya
(`ReportInsight.questionId`). Kutipan hanya diambil dari pertanyaan berupa prosa.
Batasnya juga dipotong, bukan ditolak.

## Consequences

- (+) Laporan satu dataset dengan pertanyaan berbeda jenis punya bagian yang
  sesuai untuk masing-masing; tidak ada lagi grafik sentimen untuk pertanyaan
  yang tidak punya sentimen.
- (+) Persentase sentimen dihitung dari jawaban yang memang dinilai. Beranda
  memakai `evaluatedCount`, bukan jumlah semua hasil.
- (+) Janji privasi tetap benar, dengan satu tambahan yang ditulis di halaman
  privasi: judul kolom dikirim untuk menebak jenisnya.
- (+) Pertanyaan `scale` tidak memakan biaya model.
- (−) **Tebakan tanpa contoh isi lebih lemah** daripada dengan contoh, terutama
  untuk membedakan `evaluative` dari `thematic`, yang hanya terbaca dari judul.
  Akurasinya belum diukur; `detected_mode` disimpan agar bisa.
- (−) **`segment` belum bisa dipilih** di wizard (menunggu C.6). Kolom yang
  ditebak `segment` tampil sebagai "Tidak dipakai", sehingga `segment` →
  `ignore` di `column_modes` bukan koreksi pengguna.
- (−) **Mode tidak bisa diubah setelah unggah.** Tebakan yang keliru dan lolos
  berarti unggah ulang.
- (−) `topics` sekarang bermakna tiga hal tergantung mode. CSV menambah kolom
  `mode` supaya pembacanya tahu yang mana.
- (−) Batch `categorical` berurutan: pertanyaan dengan 1.000 jawaban butuh ±34
  panggilan satu per satu.
- (−) Biaya panggilan deteksi tidak tercatat di job mana pun (hanya di log).
- (−) Satu laporan tetap digambar tiga layout; setiap mode menambah cabang di
  ketiganya.

## Alternatives considered

- **Tiga contoh nilai per kolom** (rancangan §4.2) — mengirim nama dan email ke
  OpenAI sebelum ada yang memilih kolom; melanggar janji yang sudah
  dipublikasikan.
- **Kolom `values` terpisah dari `topics`** — migrasi dan cabang kedua di setiap
  agregator, filter, dan ekspor untuk data yang dihitung dengan cara yang sama.
- **Sentimen "netral" dengan keyakinan 0 untuk mode tanpa sentimen** — tanpa
  migrasi, tapi angka itulah yang membuat laporan pilot berbohong.
- **`scale` lewat model** — biaya dan peluang salah untuk menyalin angka.
- **Satu panggilan pembuat "buku kode" untuk `categorical`** sebelum batch —
  konsisten dan paralel, tapi menambah prompt dan metode adapter; daftar pilihan
  yang terbawa antar-batch memberi hasil yang sama dengan prompt yang sudah ada.
- **Mode dibaca dari pertanyaan saat laporan dibuka** — laporan lama berubah
  arti saat mode diubah.

# 0018. Penggabungan topik: lapisan di atas label, dua tahap, model hanya mengelompokkan

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

Label topik ditulis model satu jawaban demi satu, jadi satu hal muncul dengan
beberapa nama. Normalisasi yang ada hanya huruf kecil dan spasi. Diukur di
dataset pilot ([perbandingan prompt](../research/prompt-comparison-01.md)):

- "kepercayaan diri" (49) dan "percaya diri" (15) dihitung sebagai dua topik,
  sehingga nilai dengan 64 sebutan tampil seri di urutan pertama dengan
  "keberanian" (49).
- Di pertanyaan kritik dan saran, 69 label untuk 86 jawaban bertopik; 54 label
  disebut satu kali. Keluhan soal suara terpecah ke beberapa label.

Rencana awal (embedding + clustering) dibatalkan setelah pilot karena dianggap
berlebihan; yang tersisa di rencana adalah "satu panggilan LLM atas daftar
topik". Dua draf pertama prompt itu gagal di label pilot, dan itu yang membentuk
keputusan di bawah ([catatan pengukuran](../research/topic-merge-01.md)).

## Decision

**Penggabungan adalah lapisan, bukan penulisan ulang.** `analysis_results.topics`
tetap berisi label persis seperti yang diberikan model. Job mencatat label mana
yang dihitung sebagai topik mana di kolom baru `analysis_jobs.topic_merges`:

```json
{
  "prompt_version": "merge.v1",
  "questions": { "<id pertanyaan>": { "percaya diri": "kepercayaan diri" } }
}
```

`{}` berarti tidak ada yang digabung: semua job sebelum ini, dan job yang
topiknya memang tidak perlu digabung. Menghapus isi kolom itu mengembalikan
laporan ke label aslinya.

**Diterapkan di satu tempat, saat hasil dibaca.** `listJobResults` membaca
label lewat lapisan itu dan mengembalikan `topics` (yang dihitung laporan) dan
`rawTopics` (yang ditulis model). Semua yang membaca hasil — grafik, tabel
silang, kutipan per topik, filter penjelajah, cetak, PDF, CSV — ikut tanpa
diubah satu per satu. Ringkasan eksekutif membaca hasilnya sendiri dan
menerapkan lapisan yang sama, supaya angka yang dikutipnya sama dengan grafik.

**Per pertanyaan, hanya untuk prosa.** Label yang sama di dua pertanyaan adalah
dua topik (pilot 01, §4.4). Hanya `evaluative` dan `thematic` yang digabung;
`categorical` sudah menyatukan ejaan saat dianalisis (ADR-0016) dan `scale`
adalah angka.

**Model hanya mengelompokkan; kode yang memutuskan sisanya.**

- Model menjawab dengan label yang disalin dari daftar. Balasannya dicocokkan
  dengan daftar yang dikirim: label yang diubah atau dikarang dibuang.
- Nama sebuah kelompok adalah anggotanya yang paling sering disebut, dipilih
  kode. Model tidak bisa menamai ulang topik atau menambah topik.
- Satu label hanya masuk satu kelompok (yang pertama menyebutnya). Kelompok
  berisi lebih dari 8 label dibuang seluruhnya: itu bukan merapikan ejaan, itu
  melipat satu bidang ke satu batang.
- Paling banyak 300 label per pertanyaan dikirim, dari yang paling sering.

**Dua tahap: usul, lalu periksa pasangan demi pasangan** (`merge.v1`). Tahap
pertama diberi seluruh daftar dan mengusulkan kelompok. Tahap kedua diberi tiap
pasangan (nama kelompok, label) dan menjawab sama atau beda. Hanya pasangan yang
dijawab sama yang digabung; pasangan tanpa jawaban, atau yang dijawab dua kali
berlawanan, tidak. Kalau tahap kedua gagal, tidak ada yang digabung — usulan
yang tidak diperiksa lebih buruk daripada tidak ada.

**Tidak pernah menggagalkan job.** Penggabungan berjalan setelah hasil
tersimpan dan sebelum ringkasan ditulis. Pertanyaan yang panggilannya gagal atau
melempar error dibiarkan dengan labelnya; penulisan kolomnya adalah pernyataan
sendiri, sehingga di database yang belum punya kolom itu job tetap selesai.
Balasan yang melanggar format diminta sekali lagi, seperti batch dan ringkasan.
Token dan biaya kedua panggilan dijumlahkan ke job.

**Laporan mengatakan apa yang digabung.** Di layar, tiap pertanyaan punya
daftar "label yang dihitung bersama topik lain". Di cetak dan PDF, satu kalimat
di bawah batang topik menyebut gabungan untuk topik yang tercetak. CSV menambah
kolom `topics_raw` di ujung.

## Consequences

- Baris pertama laporan pilot berubah: "kepercayaan diri" 64, "keberanian" 49.
- **Penggabungannya konservatif.** Di label pilot, 7–13 label dilipat per
  pertanyaan dari 27–38 yang diusulkan tahap pertama. Label berbeda turun dari
  105 ke 96–98 dan dari 69 ke 57–62. Ekor label yang disebut sekali sebagian
  besar tetap: isinya hal yang memang berbeda, atau berkaitan tetapi tidak
  sama. Mengelompokkan yang berkaitan ("kursi", "suhu", "ruangan" →
  kenyamanan) adalah pekerjaan lain — tema, bukan sinonim — dan tidak
  dilakukan di sini.
- **Dua kali jalan tidak identik.** Inti gabungannya sama di tiap jalan (6
  pasangan per pertanyaan muncul di tiga dari tiga jalan); pasangan pinggiran
  berbeda. Karena gabungan dihitung sekali dan disimpan, satu laporan stabil;
  menjalankan ulang analisis bisa menggeser topik pinggiran.
- **Tidak sempurna.** Dari 20 pasangan yang digabung di satu jalan, satu
  kemungkinan salah dan dua bisa diperdebatkan (penilaian saya atas labelnya,
  bukan label manusia). Itu sebabnya daftar gabungan ditampilkan.
- Job bertambah dua panggilan per pertanyaan prosa: sekitar Rp 13 dan 8–12
  detik per pertanyaan di data pilot, berjalan paralel antar pertanyaan.
- Yang dikirim ke OpenAI di dua panggilan ini adalah teks pertanyaan dan label
  topik buatan model — bukan jawaban responden.
- Satu migrasi (`20261007000100_topic_merges.sql`), ditempel sebelum merge.
  Kode lama mengabaikan kolomnya; kode baru tetap jalan tanpanya.
- Laporan lama tidak berubah sampai analisisnya dijalankan ulang.
- `GET /api/reports/[id]` (JSON lama, tidak dipakai halaman mana pun) tidak
  menerapkan lapisan ini (DEBT).

## Alternatives considered

- **Embedding + clustering.** Rencana sebelum pilot. Butuh model kedua, ambang
  jarak yang harus disetel, dan tetap tidak tahu bahwa "ac" dan "pendingin
  ruangan" sama. Untuk daftar puluhan sampai ratusan label, satu model bahasa
  yang membaca kata-katanya lebih langsung.
- **Satu panggilan, model menjawab dengan nomor label.** Dicoba lebih dulu:
  label karangan jadi mustahil secara bentuk. Di 105 label pilot model
  kehilangan jejak nomor dan memasangkan "kepercayaan diri" dengan
  "kepemimpinan", "keceriaan" dengan "kegagalan".
- **Satu panggilan, model menjawab dengan teks label.** Benar untuk gabungan
  yang jelas, tetapi mengusulkan terlalu banyak (26–38 kelompok di pertanyaan
  refleksi, berbeda tiap jalan), termasuk "kebijakan" dengan "lingkungan" dan
  "tanggung jawab" (20 sebutan) dengan "komitmen". Tahap kedua ada karena ini.
- **Menulis ulang `topics` di tiap hasil.** Lebih sederhana dibaca, tetapi
  menghapus apa yang dikatakan model per jawaban, tidak bisa dibatalkan, dan
  mencampur dua versi prompt di satu kolom.
- **Menyimpan di `question_counts`.** Tanpa migrasi, tetapi kolom itu ditulis
  dua kali oleh runner dan berisi hitungan; pemetaan label bukan hitungan.
- **Menggabung saat laporan dibuka.** Setiap pembukaan membayar dua panggilan
  dan bisa memberi gabungan yang berbeda dari pembukaan sebelumnya.
- **Model yang lebih besar untuk langkah ini.** Biaya memang bukan batasan,
  tetapi itu menambah satu variabel lingkungan dan satu model untuk dijaga.
  Dua tahap dengan model yang sama sudah cukup tepat; diukur lagi kalau E.1
  memberi label manusia.

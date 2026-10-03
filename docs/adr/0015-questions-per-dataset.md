# 0015. Dataset punya pertanyaan; satu respons adalah satu jawaban

- **Status:** Accepted
- **Date:** 2026-10-03

## Context

Pilot 01 ([temuan §3.5 dan §4](../research/pilot-01-findings.md)): satu survei
punya beberapa pertanyaan terbuka, sedangkan sebuah dataset hanya bisa memuat
satu kolom. Header kolomnya dibuang saat unggah, dan setiap baris diperlakukan
sebagai "aspirasi". Menggabungkan jawaban dari dua pertanyaan ke satu grafik
topik menghasilkan grafik yang tidak menjelaskan keduanya.

Saat memetakan rencana ke kode, dua batas baca ikut ketahuan — diukur di project
hosted:

- select tanpa halaman berhenti di **1.000 baris**, tanpa error;
- filter `in` dengan daftar id gagal sebagai request di sekitar **400 id**.

Akibatnya sudah ada sebelum perubahan ini: job di dataset lebih dari 1.000
jawaban hanya menganalisis 1.000 pertama lalu berstatus selesai, dan laporan
dengan lebih dari ±300 hasil menampilkan teks respons kosong. Survei 228
responden dengan tiga pertanyaan (684 baris) melewati batas kedua.

## Decision

**Sebuah dataset punya satu atau lebih pertanyaan, dan satu baris `responses`
adalah jawaban satu responden atas satu pertanyaan.**

- Tabel `dataset_questions` (migrasi `20261005000100`): `column_name` (header
  di sheet), `question_text` (judul bagian laporan; awalnya sama dengan header),
  `analysis_mode`, `detected_mode`, `position`, dan `organization_id` — seperti
  semua tabel tenant, karena policy RLS bersandar padanya.
- `responses.question_id` dan `responses.respondent_index` (baris sheet asal;
  sama di semua jawaban satu responden). Keduanya `NOT NULL`.
- **Sel kosong bukan respons.** Responden yang melewati satu pertanyaan tidak
  punya baris untuk pertanyaan itu, jadi "N dari M" di tiap bagian menghitung
  jawaban atas pertanyaan itu saja.
- Satu batch analisis tidak pernah mencampur pertanyaan. Hitungan "tanpa
  aspirasi" dan "gagal" disimpan per pertanyaan di
  `analysis_jobs.question_counts`.
- Laporan dibagi per pertanyaan di tiga layout (web, cetak, PDF). Laporan dengan
  satu pertanyaan tampil persis seperti sebelumnya, tanpa judul bagian.
- `segments` di rancangan §4.3 tidak dibuat: `responses.respondent_meta` sudah
  ada dan sudah memuat kolom yang disimpan.

### Trigger untuk baris yang tidak menyebut pertanyaan

Satu project Supabase melayani dev dan produksi, dan migrasi ditempel sebelum
PR di-merge. Selama jeda itu kode yang sedang live tetap menyisipkan respons
tanpa `question_id`. Trigger `responses_fill_question` memberi baris seperti itu
pertanyaan pertama dataset-nya (dibuat dari `metadata.text_column_name` kalau
belum ada) dan nomor responden berikutnya. Karena itu kedua kolom bisa
`NOT NULL` sejak tempelan pertama, dan kode tidak perlu cabang "pertanyaan
kosong" di mana pun.

### Semua bacaan satu dataset berhalaman

`lib/supabase/read-all.ts` membaca per 1.000 baris sampai habis. Dipakai job
runner, `listJobResults`, generator ringkasan, `buildReport`, dan ekspor.
`listJobResults` sekarang satu bacaan dengan respons disematkan
(`responses (text, question_id, respondent_index)`), menggantikan dua bacaan
yang salah satunya memakai daftar id.

## Consequences

- (+) Beberapa pertanyaan terbuka dalam satu unggahan, dengan header-nya sebagai
  judul bagian laporan.
- (+) Topik, sentimen, dan kutipan tidak pernah digabung lintas pertanyaan.
- (+) Job dan laporan benar untuk dataset di atas 1.000 jawaban — sebelumnya
  salah tanpa pesan.
- (+) Putaran berikutnya (mode analisis) tidak butuh migrasi: kolom mode sudah
  ada.
- (−) **Semua pertanyaan masih dianalisis sebagai `evaluative`.** Kolom yang
  isinya pilihan atau angka tetap menghasilkan "100% netral" sampai mode
  analisis ada; wizard mengatakan itu.
- (−) **Ringkasan eksekutif masih digabung** dari semua pertanyaan, dan
  halamannya mengatakan itu. `summary.v3` dengan masukan per pertanyaan datang
  bersama mode, supaya hanya satu versi prompt yang dicetak.
- (−) `datasets.response_count` sekarang jumlah jawaban, bukan responden; jumlah
  responden disimpan di `metadata.respondent_count`. Batas 5.000 berlaku untuk
  jawaban (responden × pertanyaan).
- (−) `respondent_index` dataset lama adalah urutan tersimpan, bukan baris sheet
  asli (baris kosong dulu dibuang saat unggah).
- (−) Trigger yang membuat baris adalah perilaku tersembunyi. Ia hanya jalan
  untuk baris yang tidak menyebut pertanyaan — yang tidak lagi ditulis kode mana
  pun setelah deploy — dan `scripts/check-migrations.mjs` mengujinya.

## Alternatives considered

- **`question_id` boleh null, dengan cabang di kode** — setiap pembaca
  (`runJob`, laporan, ekspor) harus menangani "tanpa pertanyaan" selamanya, demi
  jeda tempel–deploy yang hanya beberapa menit.
- **Satu dataset per pertanyaan** — tanpa perubahan skema, tapi satu survei jadi
  beberapa laporan terpisah, dan responden yang sama tidak bisa dihubungkan
  antar-pertanyaan (dibutuhkan C.6).
- **Jawaban sebagai kolom jsonb di satu baris per responden** — baris hasil
  analisis menunjuk ke respons, jadi tetap perlu satu id per jawaban.

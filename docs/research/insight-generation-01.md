# Pembangkitan temuan 01: ambang, tema, dan lantai dua kutipan (C.4)

- **Tanggal:** 2026-10-05
- **Prompt:** `theme.v1`, `insight.v1`, `summary.v4` (baru); hasil analisis
  `analysis.v3` dengan gabungan `merge.v1` yang sudah tersimpan
- **Data:** job `7226b3c7…` atas unggahan pilot 01: 340 hasil, pertanyaan
  refleksi (`thematic`, 213 hasil) dan kritik & saran (`evaluative`, 127 hasil,
  88 bertopik)
- **Model:** gpt-4o-mini, temperature 0
- **Keputusan:** [ADR-0019](../adr/0019-insights-from-data.md)

Yang dikirim ke model di langkah tema hanyalah label topik. Di langkah tulis,
model juga menerima kutipan jawaban dari kolom yang dianalisis, sama seperti
ringkasan sebelumnya. Dokumen ini hanya memuat hitungan dan label buatan model,
tanpa satu pun jawaban siswa.

## 1. Ambang per topik

Ambang yang direncanakan: ≥3 sebutan atau ≥5% jawaban berkonten. Dengan
"atau", bagian 5% hanya berlaku saat lebih rendah dari 3, yaitu di bawah 60
jawaban bertopik.

| Pertanyaan | Topik berbeda | Lolos ≥3 | Lolos ≥5% saja | Lolos ≥3 dan ≥5% |
| ---------- | ------------: | -------: | -------------: | ---------------: |
| Refleksi   |            93 |       21 |              5 |                5 |
| Kritik     |            52 |        8 |              2 |                2 |

Sebaran sebutan di pertanyaan kritik: 33 topik disebut sekali, 11 dua kali,
6 tiga kali, satu enam kali ("usulan kegiatan"), satu 17 kali ("kualitas acara").

Yang tidak lolos di pertanyaan kritik adalah inti masalahnya. Keluhan soal suara
ada di "kualitas audio" (3, semua negatif), "kualitas mic" (2), "teknis suara"
(2), "kualitas sound" (1) dan "masalah teknis" (2). Hanya yang pertama lolos,
dan sebagai topik tiga sebutan ia sejajar dengan "kualitas dekorasi". Pencahayaan
tidak lolos sama sekali ("kualitas pencahayaan" 2, "pencahayaan" 2).

Kalau "dan" dipakai, ambang menjadi stabil tetapi buta: kritik hanya punya dua
butir, "kualitas acara" dan "usulan kegiatan".

Aturan tambahan untuk kritik (terbelah: >35% positif dan >35% negatif; negatif
bulat: >80% negatif dengan ≥5 jawaban) tidak menemukan apa pun per topik. Satu
topik terbelah hanya punya dua jawaban.

## 2. Tema: tiga draf

Satu panggilan per pertanyaan, berisi label topik terurut dari yang paling
sering. Model hanya mengelompokkan; kode memeriksa labelnya.

**Draf 1** ("kelompokkan label yang membicarakan satu pokok"). Tiga jalan per
pertanyaan:

- Kritik: model mengelompokkan menurut kata depan. "Kualitas acara" menelan
  "kualitas audio", "kualitas dekorasi", "kualitas pendingin ruangan", "kualitas
  mic", "kualitas pencahayaan", "kualitas sound" dan lain-lain: 10 label, 35
  jawaban. Keluhan suara hilang ke dalamnya. 8–9 butir.
- Refleksi: 18–20 butir. "Kepercayaan diri" dan "keberanian" dijadikan satu tema
  (106 jawaban), membatalkan pemisahan yang justru menjadi baris pertama laporan
  setelah C.5.

**Draf 2** (+ "kelompokkan menurut benda atau hal yang dibicarakan, bukan kata
pembungkusnya", contoh dengan "kualitas toilet" dan "kualitas internet" di tema
berbeda):

- Kritik: "Audio dan pencahayaan" (11 jawaban, 11 negatif) terbentuk di ketiga
  jalan. "Kualitas acara" masih menampung "evaluasi acara", "jalannya acara",
  "kualitas alat", "masalah teknis". 10–11 butir.
- Refleksi: 20–21 butir; "kepercayaan diri" diberi nama tema "Nilai diri".

**Draf 3** (+ "label umum tidak masuk tema mana pun"), lima jalan, kritik saja:

| Jalan | Butir ≥3 | Tata suara | "Kualitas acara" menampung |
| ----- | -------: | ---------- | -------------------------- |
| 0     |       10 | 11, 11 neg | 4 label umum lain          |
| 1     |       11 | 11, 11 neg | sama                       |
| 2     |       11 | 11, 11 neg | sama                       |
| 3     |       10 | 11, 11 neg | sama                       |
| 4     |       10 | 11, 11 neg | sama                       |

Aturan label umum tidak dipatuhi. Yang ditampung label umum hanya label umum
lain, jadi hasilnya bisa diterima dan dicatat di `DEBT.md`. Pinggiran tema
berubah antar jalan ("usulan kegiatan" berdiri sendiri dengan 6 jawaban, atau
masuk "Usulan dan kreativitas" dengan 7 atau 12), intinya tidak. Draf 3 dirilis sebagai `theme.v1`, hanya untuk
pertanyaan kritik.

## 3. Menulis temuan

**Draf pertama** `insight.v1` memberi satu panggilan per pertanyaan dengan semua
butirnya. Kritik: 10 dari 10 tertulis. Refleksi: **2 dari 21** tertulis. Contoh
di prompt berisi dua butir, dan model berhenti setelah dua.

Perbaikan:

- Prompt menyebut jumlahnya: "Ada N pokok, bernomor …. Tulis tepat N temuan."
- Paling banyak 15 butir per panggilan, dipecah sama rata dan berjalan
  berdampingan (21 → 11 + 10).
- Butir yang dilewati balasan ditanyakan sekali lagi.

Setelah perbaikan, dua jalan, refleksi dan kritik:

| Jalan | Refleksi tertulis | Kritik tertulis | Gagal lantai dua kutipan | Waktu (refleksi / kritik) |
| ----- | ----------------: | --------------: | -----------------------: | ------------------------- |
| 0     |           21 / 21 |         10 / 10 |                        0 | 11,6 s / 11,3 s           |
| 1     |           21 / 21 |         10 / 10 |                        0 | 8,4 s / 11,5 s            |

Setiap temuan mengutip tepat dua jawaban, batas bawahnya, padahal tersedia tiga.

## 4. Satu jalan penuh

`generateReportSummary` dengan klien database asli. Satu-satunya penulisan, ke
`reports`, ditangkap dan tidak dikirim, sehingga laporan yang sudah dilihat
panitia tidak berubah sebelum kode ini dirilis.

- 14 detik, Rp 45 untuk paragraf, tema, dan temuan.
- 31 temuan: 21 refleksi, 10 kritik. Semua mengutip ≥2 jawaban milik butirnya
  sendiri. Urutannya menurun menurut dukungan (63, 48, 29, 23, 20, …, 3).
- Lima teratas: kepercayaan diri (63), keberanian (48), kepemimpinan (29),
  kualitas acara (23), tanggung jawab (20).
- Paragraf `summary.v4` menyebut 63 untuk kepercayaan diri, angka yang sama
  dengan grafik.

## Batasan

- **Tanpa label manusia.** Yang diukur adalah apakah setiap butir tertulis dan
  bersandar pada kutipannya sendiri, bukan apakah detailnya benar tentang
  kutipan itu. Satu judul di jalan kedua ("Nilai diri perlu ditingkatkan")
  terbaca sebagai salah tafsir label; itu bacaan saya, belum diperiksa
  terhadap kutipannya. Untuk itu E.1.
- **Lima teratas diurutkan lintas pertanyaan.** Pertanyaan refleksi punya
  jawaban dua kali lebih banyak, jadi empat dari lima teratas berasal darinya.
  Temuan "Audio dan pencahayaan", satu-satunya yang bertanda hampir semua
  negatif, ada di urutan ke-8, di balik "Lihat semua". Urutan ini mengikuti
  keputusan pilot §5 apa adanya; dicatat di `DEBT.md`.
- **Satu dataset, satu job.** Tema di dataset lain bisa membentuk wadah umum
  yang lebih besar dari yang terlihat di sini.

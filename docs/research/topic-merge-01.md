# Penggabungan topik pada label pilot 01 (`merge.v1`)

- **Tanggal:** 4 Oktober 2026
- **Prompt:** `merge.v1` (dua tahap), model `gpt-4o-mini`, temperature 0
- **Data:** label topik dari job `analysis.v3` yang tersimpan untuk dataset
  pilot 01 (228 responden, dua pertanyaan terbuka). Yang diproses dan yang
  dicatat di sini hanya **label buatan model dan hitungannya**. Tidak ada
  jawaban responden yang dikirim ke model di langkah ini, dan tidak ada yang
  dikutip.
- **Keputusan desain:** [ADR-0018](../adr/0018-topic-merge.md)

## Ringkasan

| Pertanyaan                      | Label berbeda | Sesudah digabung | Dilipat | Disebut sekali |
| ------------------------------- | ------------- | ---------------- | ------- | -------------- |
| Refleksi (`thematic`)           | 105           | 96–98            | 7–9     | 71 → 65–66     |
| Kritik dan saran (`evaluative`) | 69            | 57–62            | 7–12    | 54 → 40–47     |

Rentang adalah tiga kali jalan atas daftar label yang sama.

- Yang diminta rencana tercapai untuk duplikat yang jelas: "percaya diri"
  masuk ke "kepercayaan diri" di setiap jalan, dan baris pertama laporan
  menjadi **kepercayaan diri 64, keberanian 49** (sebelumnya 49 dan 49).
- Penggabungannya **konservatif**. Ekor label yang disebut sekali sebagian
  besar tetap. Fragmentasi yang diukur di
  [perbandingan prompt](prompt-comparison-01.md) berkurang sedikit, tidak
  hilang.
- **Tidak ada label manusia.** Benar-salahnya sebuah gabungan di bawah adalah
  penilaian saya atas labelnya.

## 1. Tiga rancangan prompt

Contoh di dalam prompt sengaja bukan dari data pilot (wifi, kantin, toilet),
supaya label pilot bisa dipakai untuk memeriksa.

| Rancangan                           | Refleksi: kelompok per jalan | Yang terjadi                                                                |
| ----------------------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| Satu tahap, jawab dengan nomor      | 45, 46, 49                   | Model kehilangan jejak nomor: "kepercayaan diri" ← "kepemimpinan"           |
| Satu tahap, jawab dengan teks label | 29, 38, 26                   | Gabungan jelas benar, tetapi juga "kebijakan" ← "lingkungan" dan sejenisnya |
| Dua tahap: usul, lalu periksa       | 7, 8, 9                      | Yang dipakai                                                                |

Tahap pertama mengusulkan 27–38 pasangan per pertanyaan; tahap kedua, yang
melihat tiap pasangan sendiri, menerima 7–13. Di semua jalan tidak ada label
dalam usulan yang tidak ada di daftar.

## 2. Pertanyaan refleksi

213 jawaban, semuanya bertopik, 105 label.

- **Di tiga dari tiga jalan (6):** percaya diri → kepercayaan diri;
  kedisiplinan → disiplin; berbicara di depan umum → public speaking; gotong
  royong → kerja sama; semangat hidup → semangat; kerja keras → usaha.
- **Di dua jalan (2):** mimpi → impian; kejujuran → integritas.
- **Di satu jalan (2):** komitmen → tanggung jawab; pelayanan → serviam.

Delapan topik teratas sesudah digabung sama di ketiga jalan, kecuali hitungan
"integritas" (10 atau 11) dan "tanggung jawab" (20 atau 22).

## 3. Pertanyaan kritik dan saran

129 hasil, 86 di antaranya bertopik, 69 label.

- **Di tiga dari tiga jalan (6):** kualitas mic dan kualitas sound → kualitas
  audio; dekorasi → kualitas dekorasi; pencahayaan → kualitas pencahayaan;
  kualitas ac → kualitas pendingin ruangan; kualitas proker → kualitas acara.
- **Di dua jalan (5):** eksekusi acara → jalannya acara; manajemen waktu →
  ketepatan waktu; kondisi ruangan → kondisi aula; penjadwalan acara → jadwal
  acara; tampilan acara → kualitas tampilan.
- **Di satu jalan (2):** durasi penampilan dan durasi penampilan band → durasi
  acara.

Lima topik teratas sama di ketiga jalan: kualitas acara 13, kualitas audio 6,
kualitas dekorasi 5, kualitas pencahayaan 4, kualitas pendingin ruangan 4.

### Terhadap yang ditulis di rencana

- **"kepercayaan diri" dengan "percaya diri":** ya, setiap jalan.
- **Label soal suara:** tiga dari enam. "kualitas audio", "kualitas mic" dan
  "kualitas sound" menjadi satu (6 sebutan). "teknis suara", "penggantian mic"
  dan "masalah teknis" tetap sendiri.
- **"manajemen waktu" dengan "penjadwalan acara":** tidak satu sama lain.
  Masing-masing bergabung ke tetangganya di dua dari tiga jalan.

## 4. Yang ditolak tahap kedua

Satu jalan tambahan dicatat lengkap: 38 + 33 pasangan diusulkan, 13 + 7
diterima.

- **Ditolak dengan benar** (sebagian besar): "keterbukaan" × "komunikasi",
  "kebijakan" × "lingkungan", "kekompakan" × "kerendahan hati", "kenyamanan
  peserta" × tujuh label soal kursi, konsumsi, suhu dan ruangan, "kualitas penampilan
  band" × penampilan drama, guru dan surprise.
- **Ditolak padahal sama** (beberapa): "menghadapi masalah" × "problem
  solving"; "keluar dari zona nyaman" × "coba hal baru".
- **Diterima, dari 20:** 17 jelas sama; 2 bisa diperdebatkan ("komitmen" →
  "tanggung jawab", "optimisme" → "harapan"); 1 kemungkinan salah ("kualitas
  permainan" → "kualitas penampilan band").

Penolakan atas "kenyamanan peserta" menunjukkan batas langkah ini: kursi, suhu
dan ruangan **berkaitan**, bukan **sama**. Mengelompokkannya adalah membuat
tema, dan prompt ini sengaja tidak melakukannya.

## 5. Biaya dan waktu

| Per pertanyaan | Token masuk / keluar | Biaya        | Waktu  |
| -------------- | -------------------- | ------------ | ------ |
| Refleksi       | ~2.300 / ~740        | Rp 12,6–13,8 | 8–12 s |
| Kritik         | ~2.250 / ~850        | Rp 13,8–14,2 | 9–10 s |

Sekitar Rp 27 untuk job dua pertanyaan, di atas Rp 218 untuk analisisnya.
Pertanyaan berjalan paralel, jadi job bertambah sekitar 10 detik.

## 6. Untuk C.4 (insight)

Ambang "≥3 sebutan" di pertanyaan kritik memberi 5 topik sebelum digabung dan
5, 7 atau 8 sesudahnya, tergantung jalan. Penggabungan menaikkan beberapa topik
melewati ambang tetapi tidak membuat jumlahnya stabil: di data sebesar ini
ambang 3 berada tepat di tempat hitungan bergoyang. Ambang untuk C.4 perlu
diukur di atas topik yang sudah digabung, dan kemungkinan butuh tingkat tema.

## 7. Satu jalan nyata lewat aplikasi

Sesudah migrasi ditempel, satu analisis baru atas unggahan pilot dijalankan
lewat `runAnalysisJob` — fungsi yang sama dengan yang dipanggil route — lalu
laporannya dibaca lewat `loadReportExport`. Analisis baru berarti label baru,
jadi angkanya tidak sama persis dengan §2 dan §3.

- Job selesai `succeeded`: 340 hasil, 116 non-jawaban, 65 detik, Rp 241,5
  seluruhnya (analisis, penggabungan, ringkasan).
- 15 label dilipat di pertanyaan refleksi dan 5 di pertanyaan kritik. Label
  asli tiap hasil tidak berubah; 35 dari 340 baris terbaca dengan topik yang
  berbeda dari label tersimpannya, dan tidak ada baris yang masih menampilkan
  label yang sudah digabung.
- Baris pertama pertanyaan refleksi: kepercayaan diri 63, keberanian 48.
  Ringkasan eksekutif mengutip dua angka itu, bukan angka sebelum digabung.
- CSV berisi 340 baris dengan kolom `topics_raw`; PDF tergambar (8 halaman)
  dengan kalimat gabungan di tiap bagian.
- Dua gabungan di jalan ini bisa diperdebatkan ("program kerja" → "usulan
  kegiatan", "tampil di depan umum" → "unjuk bakat"), sejalan dengan §4.

## Batasan

- Satu dataset, satu sekolah, dua pertanyaan.
- Tiga jalan (plus satu) per pertanyaan; rentang di atas bukan selang
  kepercayaan.
- Tanpa label manusia: ini mengukur konsistensi dan kewajaran, bukan akurasi.
  E.1 bisa memasukkan pasangan label sebagai butir anotasi.
- Belum diuji di daftar di atas 105 label; batas 300 label per panggilan adalah
  pengaman, bukan angka terukur.

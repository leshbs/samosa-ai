# Perbandingan `analysis.v1`, `v2`, `v3` pada dataset pilot 01

- **Tanggal:** 2026-10-04
- **Model:** `gpt-4o-mini`, temperature 0
- **Prompt:** `analysis.v1`, `analysis.v2`, `analysis.v3`
- **Dataset:** evaluasi PRIME 2026, 228 responden, dua pertanyaan terbuka (456
  jawaban). Data nyata; dokumen ini hanya memuat hitungan dan label topik
  buatan model, tidak ada jawaban siswa yang dikutip.
- **Status:** konsistensi dan arah perubahan terukur; **akurasi belum** — lihat
  [Batasan](#batasan)

## Ringkasan

| Yang diukur                                            | v1       | v2        | v3               |
| ------------------------------------------------------ | -------- | --------- | ---------------- |
| "Kritik dan saran": jawaban yang diberi hasil          | 181      | 127       | 130              |
| "Kritik dan saran": netral                             | 45–46%   | 17–27%    | 21–25%           |
| "Kritik dan saran": label sama di dua kali jalan       | 97,8%    | **89,0%** | 96,9%            |
| "Nilai apa yang diambil": positif                      | 76%      | 94%       | tidak ditanyakan |
| "Nilai apa yang diambil": topik sama di dua kali jalan | 85,9%    | 89,7%     | **98,6%**        |
| Biaya, 456 jawaban                                     | Rp 263   | Rp 242    | Rp 218           |
| Waktu                                                  | 74 detik | 42 detik  | 37–45 detik      |

Empat hal yang mengubah rencana:

1. **v1 → v2 bekerja seperti yang dimaksud.** 53 dari 81 jawaban "netral" di
   laporan pilot adalah non-jawaban. Topik nomor dua di laporan itu,
   "ketersediaan informasi" (21 jawaban), seluruhnya adalah "tidak ada".
2. **Sentimen di pertanyaan refleksi adalah artefak prompt.** Jawaban yang sama
   76% positif di v1 dan 94% di v2. v3 tidak menanyakannya.
3. **Permintaan dan usulan adalah sumber ketidakstabilan label**, bukan hal yang
   "tidak teramati di pilot". Dua kali jalan v2 pada data yang sama berbeda di
   14 jawaban, dan keempat belasnya usulan atau permintaan.
4. **Fragmentasi topik di data nyata tidak ringan.** "2 duplikat dari 10" hanya
   melihat sepuluh teratas. Di daftar penuh, 78–84% topik "Kritik dan saran"
   disebut satu kali, dan hanya 5–8 topik mencapai tiga penyebutan.

Satu regresi di v3: dua non-jawaban dengan ejaan tidak baku diberi label
`negative`. Diperbaiki di kamus pada hari yang sama (§4).

## 1. Cara mengukur

Dataset yang sama untuk semua: unggahan 4 Oktober, 228 baris, pertanyaan
"Berdasarkan seluruh rangkaian kegiatan, nilai apa yang dapat kalian ambil…"
(`thematic`) dan "Kritik dan saran untuk proker selanjutnya" (`evaluative`).

| Jalan        | Cara                                                                                                                                                  |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| v1 ×2        | Seperti pilot menjalankannya: tanpa kamus non-jawaban, jawaban di bawah 3 karakter dibuang (dulu dibuang saat unggah), sisanya semua dikirim ke model |
| v2 ×2        | Pipeline hari ini: kamus + label `no_content`, semua pertanyaan dibaca `evaluative`                                                                   |
| v3 ×2        | Pipeline hari ini dengan mode tersimpan                                                                                                               |
| v3 tersimpan | Job yang dijalankan lewat aplikasi pada dataset yang sama, sebagai pemeriksaan bahwa jalan lokal dan produk sepakat                                   |

Label dibandingkan per `response_id`. Setiap versi dijalankan dua kali karena
temperature 0 tidak membuat model deterministik: selisih antar versi hanya
berarti bila lebih besar dari selisih antara dua kali jalan versi yang sama.

Jalan v1 di sini bukan `analysis.v1` lewat pipeline hari ini. Kamus non-jawaban
ada di batcher dan berlaku untuk semua versi, jadi job v1 yang dibuat sekarang
tidak lagi mengirim "tidak ada" ke model. Untuk mengukur apa yang dilihat
panitia pilot, kamus dilewati.

## 2. "Kritik dan saran untuk proker selanjutnya"

### Nasib 228 jawaban

| Jalan        | Dibuang (< 3 karakter) | Kamus         | `no_content` oleh model | Diberi hasil |
| ------------ | ---------------------- | ------------- | ----------------------- | ------------ |
| v1 a, b      | 47                     | —             | —                       | 181          |
| v2 a, b      | —                      | 95            | 6                       | 127          |
| v3 a, b      | —                      | 95            | 3                       | 130          |
| v3 tersimpan | —                      | 99 (gabungan) |                         | 129          |

### Sebaran sentimen

| Jalan        | Positif    | Netral     | Negatif    |
| ------------ | ---------- | ---------- | ---------- |
| v1 a         | 65 (35,9%) | 81 (44,8%) | 35 (19,3%) |
| v1 b         | 63 (34,8%) | 84 (46,4%) | 34 (18,8%) |
| v2 a         | 73 (57,5%) | 22 (17,3%) | 32 (25,2%) |
| v2 b         | 61 (48,0%) | 34 (26,8%) | 32 (25,2%) |
| v3 a         | 59 (45,4%) | 31 (23,8%) | 40 (30,8%) |
| v3 b         | 62 (47,7%) | 27 (20,8%) | 41 (31,5%) |
| v3 tersimpan | 57 (44,2%) | 32 (24,8%) | 40 (31,0%) |

### v1 → v2: pemisahan non-jawaban

Dari 81 jawaban netral di v1, 53 menjadi non-jawaban di v2. 21 jawaban yang v1
beri topik "ketersediaan informasi" semuanya non-jawaban: 19 tertangkap kamus, 2
oleh model. Itu temuan §3.2 pilot, sekarang terhitung: model v1 menjelaskan
"tidak ada" sebagai kurangnya informasi, dan penjelasan itu menjadi topik
terbesar kedua di laporan.

Di 127 jawaban yang punya hasil di kedua versi, 78% labelnya sama. Selisihnya
(12 netral → positif, 7 negatif → netral, 4 netral → negatif) berasal dari
contoh few-shot baru di v2 dan dari ketidakstabilan v2 sendiri di bawah.

### Stabilitas: dua kali jalan, data yang sama

| Pasangan            | Label sentimen sama | Jawaban yang berbeda   |
| ------------------- | ------------------- | ---------------------- |
| v1 a ~ v1 b         | 97,8%               | 4                      |
| v2 a ~ v2 b         | **89,0%**           | 14                     |
| v3 a ~ v3 b         | 96,9%               | 4                      |
| v3 a ~ v3 tersimpan | 93,8%               | 8, plus 1 `no_content` |

Di v2, porsi positif pertanyaan ini 57,5% di satu jalan dan 48,0% di jalan
berikutnya. Empat belas jawaban yang berpindah semuanya permintaan atau usulan
— minta sesuatu ditambah, diperbanyak, dibuat lebih seru. 12 di antaranya
berpindah antara positif dan netral. v2 tidak punya aturan untuk jenis jawaban
ini, jadi labelnya jatuh di mana saja.

v3 punya aturannya (permintaan yang menunjuk kekurangan → negatif; usulan hal
baru tanpa keluhan → netral) dan empat belas jawaban itu sekarang stabil: 9
netral, 5 negatif, sama di kedua jalan.

**Konsekuensi untuk laporan:** selisih di bawah sekitar 3 poin persentase pada
pertanyaan `evaluative` adalah derau, bukan temuan. Tiga jalan v3 memberi
positif 44–48% dan negatif 31–32%.

### v2 → v3: yang berubah secara stabil

19 jawaban punya label yang sama di kedua jalan v2, sama di kedua jalan v3, dan
berbeda antara keduanya:

| Perpindahan            | Jumlah | Isi jawabannya                                                                |
| ---------------------- | ------ | ----------------------------------------------------------------------------- |
| positif → netral       | 6      | Usulan dan harapan ("lebih meriah lagi", minta acara tertentu)                |
| netral → negatif       | 4      | Permintaan yang menunjuk masalah: sound, tempat duduk, durasi, ketertiban     |
| netral → positif       | 4      | Tiga minta **lebih banyak** dari sesuatu (tampilan, game); satu usulan format |
| negatif → netral       | 2      | Permintaan fasilitas tanpa keluhan eksplisit                                  |
| `no_content` → negatif | 2      | **Regresi**, lihat §4                                                         |
| `no_content` → netral  | 1      | Usulan dua kata yang v2 anggap kosong; v3 benar                               |

Negatif naik dari 32 ke 40–41. Arah itu sesuai aturan baru: permintaan sopan
dibaca sebagai kekurangan.

Yang belum konsisten di v3: **"minta lebih banyak X"**. Tiga jawaban seperti
itu menjadi positif, sementara jawaban sejenis ("perbanyak…", "banyakin…")
menjadi netral. Aturan v3 tidak menyebut kasus ini. Sumbu positif/netral/negatif
memang tidak cocok untuk usulan: usulan bukan pujian dan bukan keluhan.

### Topik

| Jalan        | Topik berbeda | Disebut ≥ 3 kali | ≥ 5% jawaban | Disebut sekali | Jawaban tanpa topik |
| ------------ | ------------- | ---------------- | ------------ | -------------- | ------------------- |
| v1 a         | 92            | 9                | 2            | 74 (80%)       | 46 dari 181         |
| v2 a         | 81            | 2                | 1            | 67 (83%)       | 41 dari 127         |
| v2 b         | 80            | 4                | 1            | 68 (85%)       | 39 dari 127         |
| v3 a         | 73            | 8                | 1            | 61 (84%)       | 39 dari 130         |
| v3 b         | 68            | 7                | 1            | 51 (75%)       | 38 dari 130         |
| v3 tersimpan | 69            | 5                | 1            | 54 (78%)       | 43 dari 129         |

- **30% jawaban tidak punya topik.** Dari 39 di v3 a, 35 positif: pujian umum
  tanpa objek, median empat kata. Benar menurut aturan C.1 (penilaian positif,
  bukan non-jawaban), tapi artinya hanya sekitar 90 jawaban yang membawa isi.
- **Topik teratas tidak mengatakan apa-apa:** "kualitas acara" (10–13).
- **Sinyalnya ada di ekor, terpecah.** Di job tersimpan: "kualitas audio" (4),
  "kualitas mic", "kualitas sound", "penggantian mic", "persiapan teknis",
  "masalah teknis" (2) — satu keluhan, enam label. Begitu juga pendingin
  ruangan ("kualitas pendingin ruangan" 3, "kualitas ac", "kondisi suhu"),
  tempat duduk, dekorasi ("kualitas dekorasi" 3, "dekorasi" 2), dan jadwal
  ("jadwal acara", "penjadwalan acara", "manajemen waktu", "ketepatan waktu",
  "jadwal istirahat", "istirahat").
- **Jumlah topik "signifikan" tidak stabil.** Ambang C.4 (≥ 3 penyebutan atau
  ≥ 5%) memberi 8, 7 dan 5 topik pada tiga jalan v3 atas data yang sama.
  Label topik per jawaban identik di 83% jawaban antara dua jalan.

## 3. "Nilai apa yang dapat kalian ambil…"

| Jalan   | Diberi hasil | Positif          | Netral     | Negatif  |
| ------- | ------------ | ---------------- | ---------- | -------- |
| v1 a    | 220          | 168 (76,4%)      | 50 (22,7%) | 2 (0,9%) |
| v2 a    | 214          | 200 (93,5%)      | 12 (5,6%)  | 2 (0,9%) |
| v3 a, b | 213          | tidak ditanyakan |            |          |

Jawaban yang sama, 76% positif di satu prompt dan 94% di prompt berikutnya: 33
jawaban pindah dari netral ke positif tanpa ada yang berubah selain contoh
few-shot. Dua jawaban "negatif" di kedua versi adalah nama sebuah nilai — satu
di antaranya salah ketik. Angka sentimen di pertanyaan ini tidak mengukur
apa-apa, dan itu alasan mode `thematic` ada (ADR-0016).

v3 pada pertanyaan ini:

- Dua jalan memberi kategori yang sama untuk 228 dari 228 jawaban, dan topik
  yang identik di 98,6% jawaban. Jalan lokal dan job tersimpan: 94,4%.
- Tidak ada jawaban tanpa topik (v1 dan v2: 2–3).
- Topik berbeda turun dari 131 (v1) ke 120 (v2) ke 108 (v3); sepuluh teratas
  mencakup 50%, 54%, lalu 61% penyebutan.
- 20 topik memenuhi ambang C.4, sama di ketiga jalan.
- 5 jawaban diberi `no_content` oleh model. Tiga jelas ("tidak tahu"); dua bisa
  diperdebatkan (kesan tentang acara, dan sebuah kutipan berbahasa Inggris).

Duplikat tetap ada, dan mengubah urutan teratas: "kepercayaan diri" (49) dan
"percaya diri" (15) adalah satu nilai dengan 64 penyebutan, di atas "keberanian"
(49) yang sekarang tampil seri di puncak. Juga "disiplin" dan "kedisiplinan",
serta "kerja keras", "usaha", "ketekunan", "pantang menyerah".

## 4. Regresi di v3: non-jawaban berejaan tidak baku

Dua jawaban yang berarti "tidak ada" — satu dengan huruf akhir diulang, satu
dengan kata pengantar di depannya — diberi `no_content` oleh v2 di kedua jalan
dan `negative` oleh v3 di kedua jalan dan di job tersimpan. Kamus tidak
menangkapnya karena cocoknya harus persis.

Kecil (2 dari 130), tapi arahnya salah: "tidak ada kritik" dihitung sebagai
kritik. Kemungkinan sebabnya, v3 membaca jawaban sebagai jawaban atas
pertanyaannya, dan "tidak ada" di bawah "Kritik dan saran" terbaca sebagai
penolakan. Belum diuji.

**Diperbaiki 4 Oktober, di kamus.** Huruf akhir yang ditahan dilepas ("adaa" →
"ada"), dan kata pengantar serta partikel penutup dari daftar tertutup dibuang
dari ujung jawaban sebelum dicocokkan. Sisanya tetap harus cocok persis dengan
frasa di kamus. Diuji pada 456 jawaban dataset ini: kamus menangkap 109 jawaban,
naik dari 105; keempat tambahan itu non-jawaban, termasuk dua yang salah label,
dan tidak ada jawaban berisi yang ikut tertangkap. Dua lainnya sebelumnya sudah
diberi `no_content` oleh model; sekarang tidak lagi bergantung padanya.

Angka di dokumen ini diukur **sebelum** perbaikan. Sesudahnya, pertanyaan ini
punya 128 hasil dan 38–39 negatif pada jalan yang sama. Laporan yang tersimpan
berubah setelah analisisnya dijalankan ulang.

Perbaikan di prompt berarti `analysis.v4`, dan sebaiknya menunggu label manusia
(E.1) supaya terukur.

## 5. Biaya dan waktu

| Jalan | Token masuk | Token keluar | Biaya  | Per jawaban | Waktu       |
| ----- | ----------- | ------------ | ------ | ----------- | ----------- |
| v1    | 23.823      | 20.655       | Rp 263 | Rp 0,58     | 74 detik    |
| v2    | 25.133      | 18.159       | Rp 242 | Rp 0,53     | 42 detik    |
| v3    | 26.778      | 15.351       | Rp 218 | Rp 0,48     | 37–45 detik |

v3 lebih murah walau promptnya lebih panjang: `thematic` tidak mengeluarkan
field sentimen, dan non-jawaban tidak dikirim. Tidak ada batch yang gagal di
enam jalan.

## 6. Kesimpulan

- **v3 tetap default.** Lebih stabil dari v2 di pertanyaan `evaluative` (96,9%
  vs 89,0%), nyaris deterministik di `thematic`, dan lebih murah.
- **"Permintaan sopan tidak teramati di pilot" keliru.** Tidak terlihat di sesi
  pilot karena laporannya tidak pernah dibandingkan dengan jalan kedua. Di data
  yang sama, permintaan dan usulan adalah satu-satunya jenis jawaban yang
  labelnya goyah.
- **"Fragmentasi ringan, 2 dari 10" keliru sebagai ukuran.** Sintetis: 57 topik
  dari 120 jawaban. Nyata, ukuran yang sama: 92 dari 181 (v1), 69 dari 129
  (v3). Catatan untuk paper di `pilot-01-findings.md` §8 dikoreksi.
- **C.5 (merge topik) harus mendahului C.4 (insight).** Ambang C.4 menghitung
  penyebutan per topik; tanpa merge, keluhan soal sound terpecah enam dan tidak
  satu pun mencapai ambang dengan stabil.
- **Ambang C.4 perlu dihitung atas jawaban yang punya topik**, bukan atas semua
  hasil: 30% hasil `evaluative` di sini adalah pujian tanpa objek.

> **Lanjutan (4 Oktober):** duplikat topik yang diukur di §2 dan §3 ditangani
> oleh `merge.v1`. Hasilnya di label yang sama: [`topic-merge-01.md`](topic-merge-01.md).

## Batasan

- **Tidak ada label manusia.** Semua angka di sini mengukur konsistensi dan arah
  perubahan, bukan benar-salah. "v3 lebih stabil" tidak berarti "v3 lebih
  akurat". Itu pekerjaan E.1.
- Satu dataset, satu sekolah, satu acara, dua pertanyaan. Tidak ada pertanyaan
  `categorical` atau `scale` di unggahan ini (tiga kolom angka ditebak `scale`
  dan dilepas saat unggah).
- Dua kali jalan per versi cukup untuk melihat derau, tidak cukup untuk
  mengukurnya dengan selang kepercayaan.
- Isi jawaban dibaca untuk mengelompokkan perpindahan label di §2; pengelompokan
  itu penilaian satu orang, bukan anotasi.
- Kecocokan topik dihitung dari ejaan persis setelah huruf kecil. Dua label yang
  bermakna sama dihitung berbeda — itu yang diukur, tapi juga berarti angka
  "topik identik" adalah batas bawah untuk kesepakatan makna.

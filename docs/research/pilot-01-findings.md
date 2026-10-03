# Pilot 01 — Temuan & Keputusan Desain

**Tanggal:** 3 Oktober 2026
**Fase:** B (TODO-V2) — selesai
**Status:** temuan tercatat, keputusan diambil, revisi Fase C di §6. P0 dikerjakan
3 Oktober — koreksi terhadap rencana awal ditandai **Koreksi** di bawah.

---

## 1. Ringkasan: apa yang pilot ubah

Satu asumsi fondasional terbukti salah, dua kekhawatiran terbukti berlebihan, dan satu bug mematikan ditemukan.

|                             | Dugaan sebelum pilot                 | Kenyataan                                                   |
| --------------------------- | ------------------------------------ | ----------------------------------------------------------- |
| Isi kolom teks terbuka      | semuanya aspirasi bersentimen        | heterogen — evaluatif, preferensi, refleksi, penilaian diri |
| Fragmentasi topik           | parah (57 dari 120 di data sintetis) | ringan (2 duplikat dari 10 topik)                           |
| Ambiguitas permintaan sopan | masalah utama prompt                 | tidak teramati di pilot                                     |
| Ekspor PDF                  | berfungsi                            | rusak di produksi                                           |

Kalimat penutup `SAMOSA-TODO-V2.md` §Prinsip Urutan berbunyi: _"data nyata mungkin menunjukkan bahwa ambiguitas permintaan-sopan tidak relevan dibanding masalah yang belum pernah terlihat."_ Itu persis yang terjadi. Menunda C.1 dan C.2 sampai setelah pilot adalah keputusan yang benar.

---

## 2. Temuan: kenyamanan

### 2.1 Perpindahan tab tertunda beberapa detik

**Diagnosis:** kemungkinan besar persepsi, bukan kecepatan. Tanpa `loading.tsx`, App Router menahan seluruh halaman sampai server component selesai — tidak ada perubahan di layar selama beberapa detik, dan itu terbaca sebagai macet.

**Perbaikan:** `loading.tsx` per route dengan skeleton, plus `prefetch` saat hover pada link navigasi. Query tidak perlu disentuh. Ukur ulang setelahnya; kalau masih lambat, baru lihat query.

**Koreksi (setelah membaca kodenya):** `loading.tsx` sudah ada sejak 24 September — satu untuk seluruh grup dashboard, plus milik beranda, laporan, dan pengaturan — dan `<Link>` di produksi sudah prefetch sampai batas `loading.tsx` begitu terlihat, jadi prefetch saat hover tidak menambah apa-apa. Yang tidak tertutup adalah link yang hanya mengganti query string: **tab Pengaturan** (`?tab=`) dan paginasi dataset. Itu route yang sama, jadi `loading.tsx` tidak pernah tampil, dan tab lama diam di layar sampai server selesai — persis "tab tertunda beberapa detik". Perbaikannya: penanda tekan lewat `useLinkStatus` di tab, paginasi, dan sidebar (terukur 10 ms dari klik), plus `<Suspense key={tab}>` di panel pengaturan supaya skeleton tampil selama panel baru di-stream.

### 2.2 Ekspor PDF menghasilkan `pdf.json` — "site wasn't available"

**Diagnosis:** route PDF mati, hampir pasti timeout fungsi serverless Vercel saat `@react-pdf/renderer` memproses laporan penuh. Browser menerima halaman error, bukan binary.

**Keputusan: hentikan generasi PDF di server.** Temuan paling berguna dari pilot adalah bahwa **print berfungsi**. Itu jalan keluar yang lebih baik daripada memperbaiki yang rusak.

- Route `/reports/[id]/print` — layout khusus cetak, tanpa navigasi/sidebar
- Stylesheet `@media print`: page break di antar-section, warna chart aman untuk cetak, header/footer berulang
- Tombol "Unduh PDF" memanggil `window.print()`
- Hapus `modules/reporting/exporters/pdf.ts` dan dependensinya

Hasil: nol biaya server, nol timeout, keluaran persis seperti yang dilihat di layar, dan satu mode kegagalan hilang sepenuhnya.

**Koreksi saat dikerjakan** ([ADR-0013](../adr/0013-pdf-via-browser-print.md)):

- File-nya `pdf-exporter.tsx`, bukan `pdf.ts`.
- **Bundle browser tidak mengecil**, dan memang tidak akan: `@react-pdf/renderer` hanya jalan di server. Yang mengecil adalah function server — jejak file setiap route yang menyentuh modul `reporting` turun dari 8,7 MB ke 4,7 MB. `/reports/[id]` tetap 181 kB di browser; Recharts tetap utang tersendiri.
- **Arsip organisasi ikut berubah.** Zip-nya dulu memuat PDF setiap laporan, dan itu satu-satunya jalan mengambil laporan yang sudah diarsipkan retensi. Sekarang zip memuat CSV, halaman cetak bisa membuka laporan yang diarsipkan, dan Pengaturan → Data menautkan masing-masing.
- Logo organisasi tetap tercetak (keputusan: tetap gratis), disematkan sebagai `data:` URL supaya hasil cetak tidak kedaluwarsa.
- "Page break di antar-section" dikerjakan sebagai _tidak memotong_ section pendek dan judul yang tidak tertinggal di kaki halaman, bukan satu halaman per section — laporan 5 topik tidak perlu delapan lembar.

---

## 3. Temuan: analisis

### 3.1 Jawaban terbuka tidak semuanya bersentimen 🔴

Temuan terpenting. Seluruh pipeline mengasumsikan setiap kolom teks berisi **aspirasi** — masukan dengan muatan sentimen. Survei nyata jauh lebih beragam:

| Pertanyaan diuji                   | Jenis jawaban                  | Hasil SAMOSA            |
| ---------------------------------- | ------------------------------ | ----------------------- |
| "Kegiatan apa yang paling seru?"   | pilihan dari himpunan terbatas | 100% netral             |
| "Nilai apa yang kamu pelajari?"    | refleksi                       | sentimen tidak bermakna |
| "Seberapa paham setelah sesi ini?" | penilaian diri                 | sentimen tidak bermakna |

Hasil 100% netral **bukan kegagalan model**. Model menjawab benar untuk pertanyaan yang salah — tidak ada sentimen di sana untuk ditemukan. Memaksakan sumbu sentimen ke jawaban preferensi menghasilkan chart yang secara teknis benar dan sepenuhnya tidak berguna.

→ Keputusan desain di §4.

### 3.2 "Tidak ada" disalahartikan sebagai informasi tidak memadai 🔴

Jawaban "tidak ada" berarti _responden tidak memberikan aspirasi_, bukan _jawabannya tidak bisa dianalisis_.

**Efek samping yang lebih serius dari bug-nya sendiri:** kalau jawaban kosong dihitung sebagai netral, **distribusi sentimen berbohong** — penyebutnya salah. Laporan yang menyatakan "40% netral" padahal 12 di antaranya tidak menjawab adalah kesalahan pelaporan, bukan sekadar kesalahan klasifikasi.

**Perbaikan dua lapis:**

Lapis 1 — kamus frasa non-jawaban, disaring sebelum LLM (infrastruktur sudah ada: `skippedIds` di batcher). Normalisasi lowercase + trim + hapus tanda baca berulang, lalu cocokkan persis:

```
"tidak ada", "tdk ada", "ga ada", "gaada", "gada", "nggak ada", "engga ada",
"belum ada", "tidak", "ga", "nihil", "none", "no", "-", "–", ".", "..."
```

Lapis 2 — kategori `no_content` di prompt, untuk varian yang lolos lapis 1.

**Hati-hati jangan agresif.** Berikut ini **feedback positif**, bukan jawaban kosong: `"aman"`, `"sudah bagus"`, `"semua baik"`, `"cukup"`, `"sudah oke"`. Frasa ambigu diserahkan ke LLM, bukan ke kamus.

**Pelaporan:** tampilkan terpisah — "128 dari 140 responden memberikan aspirasi". Jawaban kosong dikeluarkan dari penyebut semua persentase sentimen.

**Saat dikerjakan:**

- Lapis 2 butuh versi prompt baru, jadi **`analysis.v2` = v1 + label `no_content`**, kata per kata selain itu, supaya perbandingan v1/v2 mengukur perubahan ini saja. Prompt per mode dan `question_text` (C.3) menjadi `analysis.v3`.
- Non-jawaban tidak punya baris hasil sama sekali — tidak ada nilai sentimen yang bisa bocor ke agregator mana pun. Jumlahnya disimpan di `analysis_jobs.no_content_count` (migrasi `20261004000100`). Respons di bawah 3 karakter, yang dulu dibuang tanpa jejak, ikut terhitung di situ.
- Kamus ditambah ejaan lain dari frasa yang sama (`gak ada`, `gk ada`, `ngga ada`, `enggak ada`, `N/A`). Cocok persis setelah normalisasi, tidak pernah "mengandung": "tidak ada masalah, sudah bagus" tetap sampai ke model.
- Laporan dari `analysis.v1` menulis "Tidak dihitung", bukan "Tidak ada" — nol di sana berarti tidak diukur.
- **Ditemukan saat uji nyata:** validator unggahan membuang jawaban di bawah 3 karakter sebelum disimpan, jadi "-", "ga", "no", dan "." hilang dari kedua hitungan — "9 dari 13" untuk 14 responden. Sekarang hanya sel kosong yang dibuang. Dataset yang sudah diunggah tetap kehilangan baris itu; unggah ulang file aslinya untuk angka yang benar.
- Uji nyata `analysis.v2` (14 jawaban): kamus menangkap 3, model melabeli 2 ("belum kepikiran apa-apa sih kak hehe", "ga tau mau nulis apa"), dan "aman", "sudah bagus", "Tidak ada, sudah bagus semua." ketiganya positif. Laporan: "9 dari 14 responden memberikan aspirasi", Positif 56% = 5/9.

### 3.3 Duplikat semantik topik: ringan

2 dari 10 topik ("manajemen waktu" vs "jadwal acara" — kemungkinan besar keluhan yang sama: acara tidak tepat waktu). Jauh lebih baik dari 57-dari-120 pada data sintetis.

**Konsekuensi:** rencana embedding + clustering di C.2 adalah over-engineering. Cukup satu pass merge ringan — kirim daftar topik hasil agregasi ke LLM, minta kelompokkan yang bermakna sama, simpan sebagai layer di atas topik mentah. Biaya nol koma sekian rupiah per laporan.

### 3.4 Jumlah insight terlalu sedikit

→ Keputusan desain di §5.

### 3.5 Kolom aspirasi bisa lebih dari satu; header pertanyaan perlu ditampilkan

Satu dataset sering punya beberapa pertanyaan terbuka. Saat ini hanya satu yang bisa dipilih, dan teks pertanyaannya hilang setelah mapping.

Dua hal yang saling menguatkan: header pertanyaan dibutuhkan sebagai **konteks di laporan**, dan juga merupakan **input terbaik untuk menebak mode analisis** secara otomatis. Satu pekerjaan, dua manfaat.

→ Keputusan desain di §4.

### 3.6 Kegunaan kolom non-aspirasi dipertanyakan

Tester benar — fitur mencentang kolom lain tidak menghasilkan apa pun di laporan, jadi tidak punya arti.

Kolom-kolom itu sebenarnya **dimensi pengelompokan**: kelas, angkatan, divisi, jenis kelamin. Nilainya muncul saat laporan bisa menyatakan "kelas 12 jauh lebih kritis soal konsumsi daripada kelas 10."

**Keputusan:** jadikan mode `segment` dalam taksonomi §4. Sampai breakdown per-segmen benar-benar ada di laporan, sembunyikan pilihannya — fitur yang tidak menghasilkan apa-apa lebih buruk daripada fitur yang tidak ada.

---

## 4. Keputusan: mode analisis per-pertanyaan

### 4.1 Taksonomi

| Mode          | Kapan dipakai                                       | Output                                                      |
| ------------- | --------------------------------------------------- | ----------------------------------------------------------- |
| `evaluative`  | pertanyaan meminta penilaian, kritik, atau saran    | sentimen + topik + kata kunci + kutipan                     |
| `thematic`    | refleksi, pembelajaran, harapan                     | topik + kata kunci + kutipan — **tanpa sentimen**           |
| `categorical` | pilihan dari himpunan terbatas, walau diketik bebas | frekuensi per nilai yang dinormalisasi — **tanpa sentimen** |
| `scale`       | jawaban numerik atau Likert tekstual                | distribusi, rata-rata, modus                                |
| `segment`     | atribut responden (kelas, divisi, angkatan)         | tidak dianalisis; jadi dimensi filter & breakdown           |
| `ignore`      | timestamp, email, kolom administratif               | tidak diproses sama sekali                                  |

### 4.2 Deteksi otomatis

Satu panggilan LLM saat column mapping: kirim semua header + 3 contoh nilai per kolom, minta klasifikasi. Biaya dapat diabaikan, dijalankan sekali per dataset.

Wizard menampilkan tebakan dengan mode yang bisa diubah per kolom. **Tunjukkan tebakan yang bisa dibantah, jangan suruh user memahami taksonomimu.**

Simpan `detected_mode` terpisah dari `analysis_mode` agar akurasi deteksi bisa diukur belakangan — berapa sering user mengoreksi, dan untuk jenis pertanyaan apa. Ini data untuk paper.

### 4.3 Skema

```sql
create table dataset_questions (
  id            uuid primary key default gen_random_uuid(),
  dataset_id    uuid not null references datasets(id) on delete cascade,
  column_name   text not null,
  question_text text not null,          -- header asli dari CSV
  analysis_mode text not null,          -- evaluative | thematic | categorical | scale | segment | ignore
  detected_mode text,                   -- tebakan sistem sebelum koreksi user
  position      int  not null,
  created_at    timestamptz default now(),
  unique (dataset_id, column_name)
);

-- responses: satu baris per (responden, pertanyaan)
alter table responses
  add column question_id      uuid references dataset_questions(id) on delete cascade,
  add column respondent_index int,      -- baris ke-berapa di file asal
  add column segments         jsonb;    -- {"kelas": "12 IPA 1", "divisi": "Acara"}
```

`respondent_index` mengelompokkan jawaban dari orang yang sama — diperlukan untuk breakdown per-segmen. `segments` sengaja didenormalisasi ke tiap baris; pada skala ratusan-ribuan baris ini lebih murah daripada join, dan bisa dipindah ke tabel `dataset_respondents` kalau nanti jadi masalah.

**Migrasi dari keadaan sekarang:** tiap baris `responses` yang ada menjadi satu (responden, pertanyaan tunggal). Backfill langsung — buat satu `dataset_questions` per dataset lama dengan `analysis_mode = 'evaluative'`.

**Koreksi saat dikerjakan** (ADR-0015, migrasi `20261005000100`):

- `dataset_questions` juga punya `organization_id`: setiap tabel tenant membawanya, dan policy RLS bersandar padanya.
- Kolom `segments` tidak dibuat. `responses.respondent_meta` sudah ada dan sudah memuat kolom yang disimpan; segmen masuk ke sana.
- `question_id` dan `respondent_index` dibuat `NOT NULL`, dengan trigger yang mengisi keduanya untuk baris yang tidak menyebutnya. Satu project Supabase melayani dev dan produksi dan migrasi ditempel sebelum merge, jadi kode yang sedang live tetap menyisipkan baris tanpa pertanyaan selama jeda itu.
- `respondent_index` dataset lama adalah urutan tersimpan, bukan baris sheet asli: baris kosong dulu dibuang saat unggah dan semua baris satu dataset punya timestamp yang sama.
- "`no_content` per pertanyaan" butuh tempat: `analysis_jobs.question_counts`.
- **Ditemukan saat memetakan ke kode:** bacaan dibatasi. Diukur di project hosted, select tanpa halaman berhenti di 1.000 baris dan filter daftar id gagal di sekitar 400 id. Job di dataset lebih dari 1.000 jawaban hanya menganalisis 1.000 pertama; laporan dengan lebih dari ±300 hasil menampilkan teks kosong. Tiga pertanyaan melipatgandakan jumlah baris, jadi semua bacaan satu dataset sekarang berhalaman.
- Dikerjakan dua putaran. Putaran 1 (ini): skema, unggah beberapa kolom, laporan per pertanyaan — semua pertanyaan masih `evaluative` di `analysis.v2`. Putaran 2: deteksi mode, prompt per mode (`analysis.v3`), ringkasan per pertanyaan (`summary.v3`).

### 4.4 Dampak ke prompt dan laporan

- **Prompt** menerima `question_text` sebagai konteks. Ini saja kemungkinan besar sudah meningkatkan kualitas — "Apa yang perlu diperbaiki?" dan "Apa yang paling berkesan?" menetapkan harapan yang sepenuhnya berbeda terhadap jawaban yang sama.
- **Prompt per mode**, bukan satu prompt untuk semua. `thematic` dan `categorical` tidak boleh punya field sentimen sama sekali — jangan biarkan model mengisi sesuatu yang tidak diminta.
- **Laporan tersegmentasi per pertanyaan.** Teks pertanyaannya jadi judul section. Jangan gabungkan jawaban dari pertanyaan berbeda ke satu kolam topik.
- **Ringkasan eksekutif** menarik dari semua pertanyaan, tapi menyebutkan asalnya.

---

## 5. Keputusan: pembangkitan insight

Dua opsi yang dipertimbangkan — skala mengikuti volume data, atau maksimum yang diatur user — **keduanya ditolak**, karena keduanya menjadikan jumlah sebagai parameter.

**Skala-per-volume** salah karena jumlah insight tidak berkorelasi dengan jumlah respons. 500 orang mengeluhkan satu AC rusak menghasilkan satu insight; 50 orang mengeluhkan sepuluh hal berbeda menghasilkan sepuluh.

**Maksimum yang diatur user** salah karena user tidak tahu berapa banyak insight ada di datanya — itu menyuruh mereka menebak. Dan setelan maksimum menciptakan insentif menaikkannya, yang menghasilkan pengisi. Pengisi menghancurkan kepercayaan lebih cepat daripada ringkas, dan `SAMOSA-MICRO-FEATURES.md` §1 menyebut momen "kok bisa 78%?" sebagai salah satu dari tiga momen genting — insight bertempelan akan gagal di situ.

### Keputusan: turunkan dari struktur topik

**Ambang signifikansi topik** — ≥3 penyebutan **atau** ≥5% dari respons berkonten.

**Insight dibangkitkan untuk:**

1. Setiap topik signifikan — satu insight
2. Topik dengan sentimen terbelah tajam — >35% positif **dan** >35% negatif
3. Topik negatif bulat — >80% negatif dengan ≥5 respons
4. Selisih antar segmen bila kolom `segment` ada — selisih sentimen >25 poin

**Lantai kualitas (keras):** setiap insight wajib mengutip **minimal dua** respons nyata. Yang tidak bisa adalah pengamatan, bukan temuan, dan dibuang. Ini mencegah pengisi secara struktural, bukan lewat imbauan di prompt.

**Tampilan:** 5 teratas berdasarkan jumlah respons pendukung, dengan "Lihat semua (N)". User mengendalikan **apa yang terlihat**, bukan **apa yang dibuat**.

---

## 6. Revisi terhadap `SAMOSA-TODO-V2.md` Fase C

Penomoran di bawah adalah yang dipakai `SAMOSA-TODO-V2.md` sekarang, urut sesuai §7.

| Item baru                                | Asal                                                   | Isi                                                                                                |
| ---------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| **C.1** perbaikan P0                     | C.3 lama (perbaikan dari temuan) terisi                | PDF lewat cetak (§2.2), filter `no_content` (§3.2), penanda navigasi (§2.1) — **dikerjakan 3 Okt** |
| **C.2** multi-pertanyaan + mode analisis | baru                                                   | §4 — perubahan terbesar dari pilot                                                                 |
| **C.3** prompt per mode (`analysis.v3`)  | C.1 lama (analysis.v2, permintaan sopan) **diperluas** | prompt per mode, `question_text` sebagai konteks; `no_content` sudah masuk `analysis.v2` di C.1    |
| **C.4** pembangkitan insight             | baru                                                   | §5                                                                                                 |
| **C.5** merge topik                      | C.2 lama (konsolidasi topik) **dikecilkan**            | embedding/clustering dicoret; satu pass merge LLM atas daftar topik (§3.3)                         |
| **C.6** breakdown per-segmen             | baru                                                   | §3.6; sampai ini selesai, pilihan kolom lain di wizard disembunyikan (sudah, di C.1)               |

Yang tidak berubah: Fase D (tes orkestrasi, coverage gate) dan Fase E (research track) tetap seperti semula. Dataset pilot ini sekarang menjadi bahan untuk E.1.

---

## 7. Urutan kerja

**P0 — sebelum pilot kedua** (C.1, dikerjakan 3 Oktober)

1. PDF lewat print, hapus exporter server (§2.2)
2. Filter `no_content` dua lapis + pelaporan terpisah (§3.2)
3. Penanda tekan untuk link query-string — bukan `loading.tsx`, yang sudah ada (§2.1)

**P1 — kebenaran produk** (C.2, C.3)

4. Skema `dataset_questions` + migrasi (§4.3)
5. Deteksi mode otomatis di wizard mapping (§4.2)
6. Prompt per mode + `question_text` sebagai konteks (§4.4) — `analysis.v3`
7. Laporan tersegmentasi per pertanyaan

**P2 — kualitas keluaran** (C.4, C.5)

8. Pembangkitan insight berbasis topik + lantai dua-kutipan (§5)
9. Pass merge topik (§3.3)

**P3 — membuka yang tertunda** (C.6)

10. Breakdown per-segmen di laporan — baru setelah ini, pilihan kolom `segment` ditampilkan kembali (§3.6)

---

## 8. Catatan untuk paper

- Dataset pilot ini adalah bahan E.1. Anotasi manual 200 respons dapat dijalankan terhadapnya.
- `detected_mode` vs `analysis_mode` menghasilkan ukuran yang bisa dilaporkan: akurasi klasifikasi jenis pertanyaan otomatis. Ini kontribusi kecil yang bersih dan belum banyak dibahas untuk konteks survei berbahasa Indonesia.
- Temuan bahwa data sintetis melebih-lebihkan fragmentasi topik (57/120) sementara data nyata ringan (2/10) layak dilaporkan — ini kritik metodologis terhadap evaluasi berbasis fixture yang relevan di luar SAMOSA.
- Perbandingan v1 vs v2 vs v3 pada dataset yang sama tetap mungkin karena versi prompt dipin per baris hasil. v1→v2 mengukur pemisahan non-jawaban saja; v2→v3 mengukur prompt per mode.

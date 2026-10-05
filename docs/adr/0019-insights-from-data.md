# 0019. Temuan diturunkan dari data: tema untuk kritik, ambang sebutan, dua kutipan wajib

- **Status:** Accepted
- **Date:** 2026-10-05

## Context

Sampai `summary.v3`, satu panggilan menulis ringkasan eksekutif sekaligus 3–6
insight. Model memilih sendiri berapa dan tentang apa, dari 18 kutipan sampel.
Pilot 01 memutuskan kebalikannya ([temuan pilot §5](../research/pilot-01-findings.md)):
jumlah temuan bukan parameter, melainkan hasil struktur data, dan temuan yang
tidak bisa menunjuk dua jawaban nyata bukan temuan.

Ambang yang direncanakan: topik yang disebut ≥3 kali atau ≥5% jawaban
berkonten. Diukur pada job pilot yang sudah memakai gabungan topik (ADR-0018)
([catatan](../research/insight-generation-01.md)):

- Pertanyaan refleksi: 21 topik lolos. Nilai-nilai itu memang temuan masing-masing.
- Pertanyaan kritik: 8 topik lolos, dan keluhan soal suara tidak ada di antaranya.
  Keluhan itu tersebar di "kualitas audio" (3), "kualitas mic" (2), "teknis suara"
  (2), "kualitas sound" (1). Gabungan topik sengaja tidak menyatukannya karena
  label-label itu berkaitan, bukan sama.

Jadi ambang per topik melewatkan keluhan yang paling seragam di data kritik.

## Decision

**Tema untuk pertanyaan kritik, topik untuk pertanyaan refleksi.** Untuk
pertanyaan `evaluative`, satu panggilan `theme.v1` mengelompokkan topik yang
membicarakan benda atau hal yang sama ("Tata suara"). Seperti `merge.v1`, model
hanya mengelompokkan. Kode memeriksa tiap label terhadap daftar yang dikirim,
menaruh satu label di satu tema, menolak tema "lainnya", dan membiarkan label
yang tidak disebut berdiri sebagai temanya sendiri. Untuk pertanyaan
`thematic`, setiap topik adalah butirnya sendiri. Di pilot, tema tidak
mengurangi jumlah butir refleksi (18–21 dari 21), dan membuat nilai teratas
kabur: "kepercayaan diri" diberi nama "Nilai diri".

**Butir dipilih kode, bukan model.** Sebuah tema atau topik menjadi butir bila
disebut oleh paling sedikit `min(3, ⌈5% × jawaban bertopik⌉)` jawaban, dan tidak
kurang dari dua. Untuk pertanyaan kritik, butir ditandai `negative` (>80%
negatif, ≥5 jawaban) atau `split` (>35% positif dan >35% negatif). Tanda itu
membentuk tulisan butirnya, bukan butir tambahan: di pilot, setiap topik yang
bertanda sudah lolos ambang.

**Model hanya menulis.** `insight.v1` menerima daftar butir, masing-masing
dengan hitungan, label yang dicakup, tanda, dan tiga kutipan pilihan kode, lalu
menulis satu judul dan satu detail per butir, dan menyebut kutipan mana yang
mendasarinya. Daftar panjang dipecah menjadi panggilan berisi paling banyak 15
butir yang berjalan berdampingan. Butir yang dilewati balasan ditanyakan sekali
lagi.

**Lantai dua kutipan dipaksakan kode.** Kutipan dihitung hanya bila termasuk
kutipan butir itu sendiri. Temuan dengan kurang dari dua kutipan dibuang.

**Ringkasan dipisah.** `summary.v4` hanya menulis paragraf dari angka per
pertanyaan, tanpa kutipan. Paragraf dan temuan tiap pertanyaan diminta
bersamaan.

**Pertanyaan pilihan dan angka tidak punya temuan.** Buktinya adalah hitungan
itu sendiri, yang sudah tampil sebagai grafik dan disebut di paragraf.

**Disimpan bersama temuan.** Tiap `ReportInsight` membawa `support`, `topics`
dan `signal`, di `reports.insights` (jsonb), tanpa migrasi. Tema tidak menjadi
lapisan di hasil, dan grafik tetap per topik. Temuan diurutkan dari yang paling
banyak didukung. Layar menampilkan lima dengan "Lihat semua (N)". Cetak dan PDF
memuat lima secara lengkap, lalu sisanya sebagai daftar judul.

**Tidak pernah menggagalkan laporan.** Tema yang gagal digambar membuat
pertanyaan itu ditulis per topik. Temuan yang gagal ditulis membuat pertanyaan
itu tanpa temuan. Paragraf tetap tersimpan.

## Consequences

- Jumlah temuan mengikuti data: 31 di job pilot (21 refleksi, 10 kritik). Keluhan
  suara muncul sebagai satu temuan bertanda "hampir semua negatif" (11 dari 11).
- Biaya per job naik dari satu panggilan menjadi 1 + (jumlah pertanyaan kritik)
  - (jumlah panggilan tulis). Job pilot: Rp 45 untuk paragraf, tema dan temuan,
    14 detik.
- Tema berbeda sedikit antar jalan (10 atau 11 butir kritik di lima jalan), dan
  digambar ulang setiap ringkasan dibuat ulang. Karena tema tidak disimpan
  sebagai lapisan, grafik dan temuan bisa menyebut pengelompokan yang berbeda.
  Kartu temuan menyebut label yang dicakupnya.
- Ringkasan lama (`summary.v1`–`v3`) tetap terbaca seperti dulu, tanpa hitungan
  per temuan. Kartu-kartunya menyatakan bahwa temuan itu disusun dari sampel.
- Selisih antar segmen, aturan keempat di pilot §5, menunggu C.6.

## Alternatives considered

- **Ambang per topik tanpa tema.** Ditolak untuk kritik karena alasan di Context.
- **Tema untuk semua pertanyaan.** Ditolak karena alasan di Decision.
- **Satu panggilan untuk paragraf dan semua temuan.** Ditolak. Daftar 31 butir
  membuat balasan panjang dan lambat, dan draf pertama yang menulis per
  pertanyaan sudah berhenti setelah dua butir dari 21.
- **Tema sebagai lapisan tersimpan di job, seperti `topic_merges`.** Ditunda.
  Tidak ada tampilan selain temuan yang membutuhkannya sekarang (lihat `DEBT.md`).

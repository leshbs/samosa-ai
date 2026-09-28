# Fase 7 — catatan pengukuran

**Tanggal:** 2026-09-22
**Status pilot dengan pengguna nyata:** belum dilakukan.

Dokumen ini mencatat apa yang benar-benar diukur saat membangun ringkasan AI dan
export. Ini **bukan** temuan pilot: belum ada satu pun pengguna target (ketua
OSIS, panitia) yang memakai aplikasi ini. Bagian "Yang belum terjawab" di bawah
adalah pertanyaan yang hanya bisa dijawab oleh orang, bukan oleh test.

## Ringkasan eksekutif (`summary.v2`)

- **Prompt:** `summary.v2`, model `gpt-4o-mini`.
- **Dataset:** `aspirasi-120` (120 aspirasi sintetis, bahasa Indonesia).
- **Input ke model:** distribusi sentimen, 5 topik teratas, 10 kata kunci
  teratas, dan 18 kutipan bernomor.
- **Biaya satu ringkasan:** `costMicroIdr` 4.729.725 ≈ **Rp 4,73** untuk satu
  panggilan. Sebagai pembanding, analisis 120 aspirasi itu sendiri Rp 96.
- **Latensi:** 14,9 detik (dari log route `POST /api/reports/[id]/summary`).
- **Output:** 3 insight, semuanya dengan kutipan pendukung yang resolve ke
  response id nyata.

### Kenapa v2 ada

`summary.v1` hanya meminta prosa. `ReportInsight` sejak awal menjanjikan
`evidenceResponseIds`, dan model yang diberi kutipan tanpa label tidak punya cara
menyebutkan satu pun. v2 menomori kutipan dan meminta model menunjuk nomor yang
dipakai; pemanggil memetakan nomor itu balik ke response id dan **membuang nomor
yang di luar daftar**. Kutipan halangan hilang, insight-nya tetap.

### Yang terlihat dari output pertama

- Model patuh pada angka yang diberikan; tidak ada angka karangan di satu-satunya
  run yang diperiksa manual.
- Kutipan pendukung yang muncul di laporan **berulang hampir identik**
  ("Jadwal pelajaran sering berubah mendadak bikin bingung" muncul tiga kali
  dengan ekor kalimat berbeda). Ini properti dataset sintetisnya, bukan bug
  pemilihan kutipan — `selectQuotes` menyebar per topik, dan dataset ini memang
  berisi varian dari kalimat yang sama. **Dataset nyata perlu dites sebelum
  menyimpulkan apa pun soal kualitas kutipan.**

## Export

- **PDF:** 3 halaman untuk 120 aspirasi, 8.568 byte. Ukuran dokumen dibatasi
  jumlah topik, bukan jumlah respons — dataset 5.000 baris menghasilkan halaman
  sebanyak dataset 50 baris.
- **CSV:** 19.370 byte, satu baris per aspirasi.

## Dua kegagalan yang tidak terlihat dari test

Keduanya lolos test hijau dan hanya ketahuan saat dijalankan sungguhan. Layak
dicatat karena polanya akan berulang.

1. **PDF yang valid tapi kosong.** Test hanya memeriksa signature `%PDF-` dan
   ukuran > 1 KB. Di bawah jsdom, `@react-pdf/renderer` menulis header zlib yang
   tidak valid, jadi file-nya _parse_ sebagai PDF, dibuka sebagai dua halaman
   kosong, dan lolos test. Sekarang test-nya berjalan di environment node dan
   benar-benar meng-inflate satu content stream.

2. **Export 500 hanya di runtime Next.** Render PDF sukses di test Node dan gagal
   di route handler. Penyebabnya versi React yang berbeda antara server layer
   Next (19.2-canary) dan reconciler @react-pdf (18) — lihat ADR-0007.

**Pelajarannya sama dengan catatan realtime di `docs/DEBT.md`:** status "berhasil"
dari lapisan mana pun bukan bukti. Bukti adalah artefaknya sendiri — event yang
sampai, atau PDF yang dibuka dan dilihat.

## Yang belum terjawab

Butuh orang, bukan test:

- Apakah ringkasan eksekutifnya benar-benar dipakai, atau pembaca langsung lompat
  ke grafik?
- Apakah 3–5 insight terlalu sedikit atau terlalu banyak untuk sekali baca?
- Apakah kutipan pendukung menambah kepercayaan, atau justru terbaca seperti
  cherry-picking?
- Apakah PDF-nya benar-benar dicetak, atau cukup dibagikan sebagai file?

Sampai itu dijawab, angka di atas hanya bercerita soal biaya dan latensi.

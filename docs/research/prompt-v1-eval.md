# Evaluasi `analysis.v1`

- **Tanggal:** 2026-09-20
- **Model:** `gpt-4o-mini`
- **Prompt:** `analysis.v1`
- **Status:** parsial — lihat [Batasan](#batasan) sebelum memakai angka di sini

## Ringkasan

| Metrik                     | Hasil       | Target 3.8 |
| -------------------------- | ----------- | ---------- |
| Biaya per aspirasi         | **Rp 0,80** | < Rp 500   |
| Waktu, 120 aspirasi        | 19 detik    | —          |
| Waktu, 20 aspirasi         | 15 detik    | —          |
| Batch gagal                | 0 dari 5    | —          |
| Aspirasi tanpa hasil       | 0 dari 140  | —          |
| Label stabil antar parafra | 18 dari 20  | —          |
| Rata-rata confidence       | 0,84        | —          |

Biaya berada **tiga orde di bawah** target. Target Rp 500 disusun sebelum ada
pengukuran; dengan `gpt-4o-mini` biaya bukan lagi kendala desain, jadi keputusan
berikutnya (model lebih besar, prompt lebih panjang, analisis ulang) punya ruang
sangat lega.

## Pengukuran

Dua dataset, dijalankan lewat UI seperti pengguna biasa.

| Dataset | Aspirasi | Batch | Token in | Token out | Biaya    | Per aspirasi | Durasi |
| ------- | -------- | ----- | -------- | --------- | -------- | ------------ | ------ |
| kecil   | 20       | 1     | 1.462    | 1.290     | Rp 16,39 | Rp 0,82      | 15 s   |
| besar   | 120      | 4     | 7.410    | 7.874     | Rp 96,29 | Rp 0,80      | 19 s   |

Biaya per aspirasi praktis datar antara 20 dan 120 aspirasi: overhead few-shot
per batch sudah tertutup sejak batch pertama.

### Akurasi estimasi

Dialog konfirmasi menaksir **Rp 110** untuk 120 aspirasi; realisasinya Rp 96,29
— terlalu tinggi 14%. Arah ini benar: lebih baik menakut-nakuti sedikit daripada
menagih lebih dari yang dijanjikan. Konstanta di `pricing.ts` boleh dibiarkan.

Estimasi **waktu** meleset jauh lebih jauh: "± 8 detik" untuk pekerjaan yang
memakan 19 detik. Estimator mengasumsikan batch berjalan penuh paralel, padahal
`MAX_CONCURRENCY = 4` menahan dan tiap batch sendiri butuh belasan detik.
Layak dikoreksi, tercatat di [DEBT.md](../DEBT.md).

## Kualitas label

Dataset besar berisi 20 kalimat dasar, masing-masing diulang 6 kali dengan
akhiran sopan yang berbeda ("terima kasih", "tolong ya kak", dan seterusnya).
Pengulangan itu disengaja: kalau label berubah hanya karena basa-basi di ekor
kalimat, prompt-nya rapuh.

**18 dari 20 kalimat mendapat label identik di keenam variannya.** Dua yang
goyah sama-sama permintaan sopan tanpa keluhan eksplisit:

- "Kantin sekolah perlu tambah pilihan makanan sehat…" → 4× netral, 2× negatif
- "Mohon kegiatan OSIS diumumkan lebih awal…" → 4× netral, 2× negatif

Keduanya berada tepat di garis antara _permintaan_ dan _keluhan halus_, dan
`analysis.v1` memang tidak pernah memutuskan garis itu. Few-shot-nya mencakup
pujian, campuran→netral, fakta telanjang→netral, sarkasme→negatif, dan percobaan
prompt injection — tapi tidak satu pun contoh permintaan sopan. Ini celah di
prompt, bukan keacakan model.

**Rekomendasi untuk `analysis.v2`:** tambah satu contoh permintaan sopan dan
nyatakan aturannya secara eksplisit — permintaan tanpa keluhan adalah netral,
permintaan yang menyebut sesuatu rusak atau kurang adalah negatif.

Sisa penilaian manual: dari 20 kalimat dasar, 19 label sesuai pembacaan manusia
tanpa perdebatan. Satu yang layak didiskusikan adalah "Semuanya sudah cukup baik
menurut saya tidak ada keluhan" → positif, sementara aturan "fakta telanjang →
netral" bisa juga dibaca netral.

Topik dan kata kunci terisi di **seluruh 140 baris** — tidak ada larik kosong.
57 topik berbeda dari 120 aspirasi, cukup spesifik untuk agregasi tanpa pecah
menjadi satu topik per aspirasi.

## Batasan

Angka di atas jangan dibaca sebagai akurasi produksi.

1. **Datanya sintetis.** 140 aspirasi itu ditulis untuk keperluan tes, bukan
   diambil dari OSIS sungguhan. Aspirasi asli lebih berantakan: singkatan,
   typo, campur bahasa daerah, kalimat setengah jadi, dan curhat panjang yang
   memuat beberapa keluhan sekaligus. Tidak satu pun terwakili di sini.
2. **"Akurasi" di sini berarti model sepakat dengan penulis datanya.** Tidak ada
   anotator kedua, jadi tidak ada ukuran kesepakatan antar manusia sebagai
   pembanding.
3. **Checklist 3.8 meminta tiga dataset nyata berisi 100+ respons.** Yang
   terpakai dua, keduanya sintetis. Butir itu belum benar-benar tuntas.
4. **Satu kali jalan per dataset.** Stabilitas yang diukur adalah stabilitas
   antar parafrasa, bukan antar pengulangan job yang sama.

Yang sudah bisa dipegang: pipeline-nya jalan utuh, biayanya terukur dan jauh di
bawah target, dan tidak ada aspirasi yang hilang. Yang belum: seberapa baik
`analysis.v1` menghadapi bahasa siswa sungguhan.

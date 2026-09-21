# Tech debt

Utang teknis yang diambil sadar, beserta pemicu yang membuatnya harus dibayar.
Tambahkan baris baru lewat PR yang menciptakan utangnya, jangan belakangan.

## Terbuka

### `after()` tidak punya retry di level job

Job analisis dipicu `after()` di route handler ([ADR-0006](adr/0006-after-as-job-trigger.md)).
Kalau invocation mati di tengah jalan, job tertinggal di status `running`
selamanya dan tidak ada yang mencoba lagi.

**Pemicu:** dataset pertama yang gagal karena timeout, atau job pertama yang
tersangkut `running` di produksi. **Bayar dengan:** queue sungguhan.

### Estimasi waktu di dialog analisis terlalu optimistis

`estimateJobSeconds` menaksir 8 detik untuk pekerjaan yang nyatanya 19 detik
([eval](research/prompt-v1-eval.md#akurasi-estimasi)). Estimator mengabaikan
`MAX_CONCURRENCY = 4` dan latensi per batch.

**Pemicu:** pengguna mengeluh analisis "menggantung". **Bayar dengan:** kalibrasi
ulang konstanta memakai durasi job yang sudah tercatat di `analysis_jobs`.

### `analysis.v1` tidak memutuskan permintaan sopan

Permintaan tanpa keluhan eksplisit kadang netral, kadang negatif — 2 dari 20
kalimat uji goyah. Penyebabnya few-shot yang tidak memuat contoh permintaan.

**Pemicu:** laporan sentimen yang tidak konsisten antar job. **Bayar dengan:**
`analysis.v2` berisi satu contoh permintaan sopan plus aturan eksplisitnya.

### `types/database.ts` masih ditulis tangan

`pnpm db:types` belum pernah dijalankan terhadap project sungguhan, jadi tipe
tabel dipelihara manual dan bisa menyimpang dari schema tanpa ketahuan.

**Pemicu:** migrasi berikutnya yang menambah kolom. **Bayar dengan:** jalankan
`pnpm db:types` dan commit hasilnya.

### ~~`/reports` dan `/reports/[id]` masih placeholder~~ — lunas (Fase 4)

Keduanya sekarang berisi dashboard lengkap. Disimpan di sini sebagai catatan
bahwa utang ini memang dibayar, bukan dihapus diam-diam.

### E2E hanya menguji landing page

`tests/e2e/upload-analyze-report.spec.ts` punya satu test aktif; alur
upload→analisis→laporan di-`skip` karena belum ada fixture auth. Alur itu sudah
terbukti jalan, tapi lewat pengujian manual, bukan lewat CI.

**Pemicu:** regresi pertama yang lolos ke main. **Bayar dengan:** fixture yang
membuat user terkonfirmasi lewat admin API lalu menyimpan storage state.

### Seed tidak bisa dipakai untuk project hosted

`pnpm db:seed` membungkus `supabase db reset`, yang menyasar stack lokal. Untuk
project hosted, `supabase/seed.sql` harus ditempel manual ke SQL Editor.

**Pemicu:** anggota tim kedua yang perlu data contoh. **Bayar dengan:** script
seed yang bicara ke project hosted lewat service role.

---

## Ditambahkan di Fase 4

### Grafik tren waktu tidak ada

Checklist 4.2 meminta tren "kalau tanggalnya tersedia". Tidak tersedia:
`responses.created_at` adalah waktu upload, sama persis untuk semua baris dalam
satu dataset, jadi grafiknya akan berupa satu garis vertikal. Tanggal yang asli
ada di kolom _Timestamp_ bawaan Google Forms, yang saat ini masuk ke
`respondent_meta` tanpa dikenali sebagai tanggal.

**Pemicu:** dataset kedua dari organisasi yang sama, ketika orang mulai
bertanya "apakah keluhan kantin makin sering?". **Bayar dengan:** deteksi kolom
tanggal saat mapping (Fase 1.6 sudah punya tempatnya), simpan ke kolom
`responses.responded_at` yang bisa di-null, lalu tambahkan line chart.

### Filter di penjelajah tidak menyetir grafik

Memilih "Negatif" mempersempit tabel di Bagian 5, tapi grafik di atasnya tetap
menampilkan seluruh dataset. Idealnya satu baris filter menyetir semuanya.

Penghalangnya arsitektural, bukan malas: `@/modules/reporting` mengekspor
`buildReport` yang `import 'server-only'`, jadi komponen client tidak bisa
mengimpor public API-nya untuk menghitung ulang agregat di browser.

**Pemicu:** permintaan pertama "tunjukkan topik untuk aspirasi negatif saja".
**Bayar dengan:** pecah public API reporting jadi dua — agregator murni yang
aman untuk client, dan service yang menyentuh database.

### Halaman laporan membawa 109 kB JS

Recharts (beserta d3) membuat `/reports/[id]` jadi 326 kB first load, jauh di
atas halaman lain yang ~106 kB. Di jaringan sekolah itu terasa.

**Pemicu:** keluhan "laporannya lama kebuka" dari user sungguhan. **Bayar
dengan:** `next/dynamic` untuk dua chart Recharts, supaya KPI tile dan sebaran
sentimen (keduanya HTML biasa, tanpa Recharts) tampil lebih dulu.

### Realtime belum terbukti end-to-end

`ReportRealtime` sudah terpasang dan channel-nya terhubung, tapi
`20260921000100_realtime_analysis_jobs.sql` belum di-`supabase db push`. Sampai
migrasi itu jalan, `analysis_jobs` tidak ada di publication `supabase_realtime`
dan event-nya tidak akan pernah sampai — halamannya tetap benar, hanya tidak
memperbarui sendiri.

**Pemicu:** sekarang. **Bayar dengan:** `pnpm db:migrate`, lalu jalankan ulang
sebuah analisis sambil membuka laporannya di tab lain.

### Checkpoint 4.6 belum dikerjakan

Demo dashboard ke 2-3 target user (ketua OSIS, panitia) dan catatan grafik mana
yang berguna belum ada. Ini butuh orang, bukan kode.

**Pemicu:** sebelum mulai Fase 5. **Bayar dengan:** satu sesi 30 menit dengan
pengurus OSIS sungguhan, pakai dataset mereka sendiri.

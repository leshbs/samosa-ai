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

### ~~Realtime belum terbukti end-to-end~~ — lunas 2026-09-22

Migrasi `20260921000100_realtime_analysis_jobs.sql` sudah dijalankan dan
`analysis_jobs` sekarang ada di publication `supabase_realtime`. Diverifikasi
end-to-end di browser: job `running` → `succeeded` memunculkan toast "Analisis
selesai — laporan diperbarui." dan frame `postgres_changes` terlihat di
websocket.

Verifikasi itu menemukan satu bug nyata: channel-nya subscribe sebelum session
diserahkan ke socket realtime, jadi RLS membuang semua row. Gejalanya menipu —
channel tetap membalas `SUBSCRIBED` dan server tetap bilang "Subscribed to
PostgreSQL", tapi tidak ada satu pun event yang datang. Diperbaiki dengan
`supabase.realtime.setAuth(token)` sebelum `.subscribe()`.

**Catatan untuk lain kali:** status channel bukan bukti. Satu-satunya bukti
adalah event yang benar-benar sampai. Perubahan `alter publication` juga butuh
beberapa detik sebelum Realtime memakainya — probe pertama setelah migrasi bisa
gagal padahal migrasinya benar.

### Checkpoint 4.6 belum dikerjakan

Demo dashboard ke 2-3 target user (ketua OSIS, panitia) dan catatan grafik mana
yang berguna belum ada. Ini butuh orang, bukan kode.

**Pemicu:** sebelum mulai Fase 5. **Bayar dengan:** satu sesi 30 menit dengan
pengurus OSIS sungguhan, pakai dataset mereka sendiri.

### PDF tanpa nomor halaman

`render` prop di `@react-pdf/renderer` — satu-satunya cara mendapat
`pageNumber`/`totalPages` — tidak menghasilkan apa pun di dokumen laporan,
diam-diam. Diukur, bukan ditebak: di dokumen minimal, `<Text fixed render=...>`
muncul normal; di `pdf-exporter.tsx` tidak, bahkan ketika callback-nya
mengembalikan string konstan. `<Text fixed>` dengan children statis di posisi
yang persis sama muncul.

Footer sekarang memuat nama organisasi dan dataset, tanpa nomor halaman.
Laporan 2-3 halaman masih terbaca, tapi kalau nanti jadi lebih panjang ini
perlu dibereskan.

**Catatan untuk lain kali:** tiga bentuk footer gagal tanpa pesan error apa pun
(flex row di dalam box absolute, `left` + `right` bersamaan, dan `render`).
Satu-satunya cara menemukannya adalah merender PDF-nya lalu melihatnya.

### Chart PDF digambar ulang, tidak reuse Recharts

Bar di PDF disusun dari primitif `<View>`, terpisah dari komponen Recharts di
web. Kalau bentuk chart berubah, dua tempat harus diubah. Trade-off ini diambil
sadar di ADR-0004 dan masih wajar selama chart-nya bar sederhana.

### Settings: foto profil, undang anggota, hapus akun

Checklist 7.5 menyebut empat hal yang belum ada:

- **Foto profil** — butuh bucket storage, upload, crop, dan penanganan gambar
  besar. Avatar sekarang memakai inisial dari nama.
- **Undang anggota lewat email** — checklist menandainya opsional untuk MVP.
  Butuh alur undangan (token, email, penerimaan) yang setara ukurannya dengan
  7.4, jadi ditunda bersama.
- **Hapus akun** — sengaja tidak dibuat. Ini tidak bisa dibatalkan dan menyentuh
  `auth.users` plus cascade ke seluruh data organisasi. Membuat tombolnya
  setengah jalan lebih berbahaya daripada tidak ada tombol sama sekali. DoD 7.5
  hanya mensyaratkan edit profil dan nama organisasi, dan keduanya sudah jalan.
- **Nama tampilan disimpan di `auth.users.user_metadata`**, bukan tabel
  `profiles`. Kalau profil nanti punya field kedua, pindahkan ke tabel sendiri.

### RLS organisasi lebih longgar dari policy modul

`organizations_update` di RLS mengizinkan `owner` dan `admin`, sedangkan
`can(role, 'org:manage')` hanya `owner`. Route memakai yang lebih ketat, jadi
perilakunya benar, tapi dua sumber aturan yang tidak sama persis itu menunggu
untuk membingungkan seseorang. Samakan salah satunya.

### Checkpoint 7.6 belum lengkap: butuh orang

Happy path-nya sudah diverifikasi mesin (lihat `docs/research/phase-7-findings.md`):
unggah CSV → analisis → ringkasan AI → laporan → export PDF dan CSV, semuanya
jalan di browser dengan data nyata dan nol error. Yang belum ada adalah bagian
7.6 yang tidak bisa dikerjakan tanpa orang: mendemokan ke ketua OSIS/panitia dan
mengumpulkan umpan balik. Ini item yang sama dengan checkpoint 4.6.

### Kutipan per topik bisa berulang di dataset dengan kalimat mirip

Di `aspirasi-120`, bagian "Contoh aspirasi per topik" di PDF menampilkan tiga
varian dari kalimat yang hampir sama. `topResponsesByTopic` memilih satu negatif,
satu positif, lalu sisanya berdasarkan confidence — tidak ada dedup kemiripan.
Di dataset sintetis ini wajar; di dataset nyata perlu dicek sebelum diputuskan
apakah butuh penyaring kemiripan.

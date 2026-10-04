# 0017. Gerbang coverage: 80% di CI, lantai lebih tinggi untuk file job

- **Status:** Accepted
- **Date:** 2026-10-04

## Context

`vitest.config.ts` menyimpan ambang 80% sejak awal, dan `docs/OVERVIEW.md`
menyebutnya target. Tidak ada yang menjalankannya: CI memanggil `pnpm test:run`,
`pnpm check` tidak menyentuh tes, dan `pnpm test:coverage` gagal setiap kali
dijalankan. Diukur 25 September: 59,76% baris, dengan `job-runner.ts` di 0,71%
dan `job-queries.ts` di 2,43% — coverage berbanding terbalik dengan risiko.

Diukur ulang 4 Oktober, setelah C.1 dan C.2:

| File                   | 25 Sep | 4 Okt, sebelum | 4 Okt, sesudah PR ini |
| ---------------------- | ------ | -------------- | --------------------- |
| `job-runner.ts`        | 0,71%  | 88,99%         | 100%                  |
| `job-queries.ts`       | 2,43%  | 65,27%         | 100%                  |
| `orchestrator.ts`      | —      | 94,08%         | 97,67%                |
| `stuck-job-sweeper.ts` | —      | 100%           | 100%                  |
| Semua file             | 59,76% | 79,26%         | 81,34%                |

Menulis tes untuk jalur gagal menemukan dua jalur yang tidak punya akhir:

- Adapter yang melempar error (bukan mengembalikan `Result`) menolak seluruh
  `analyzeResponses`. Batch yang sudah selesai ikut terbuang, dan tidak ada yang
  menangkap lemparan itu sampai ke `after()`.
- Lemparan apa pun di `runJob` setelah job diklaim meninggalkan baris job di
  `running`. Sweeper hanya jalan sekali sehari (DEBT), jadi halaman menampilkan
  progress bar sampai ~24 jam dan pengirimnya tidak pernah dikabari.

## Decision

**Ambang 80% tetap, dan sekarang dijalankan.** CI memanggil `pnpm test:coverage`
sebagai ganti `pnpm test:run`: satu kali jalan untuk tes dan gerbangnya. Tidak
dimasukkan ke `pnpm check`, yang dijalankan sebelum tiap commit dan harus tetap
beberapa detik.

**File job punya lantai sendiri: 90% baris, fungsi dan statement, 80% cabang**,
untuk `job-runner.ts`, `job-queries.ts`, `orchestrator.ts` dan
`stuck-job-sweeper.ts` bersama-sama. Angka global bisa tetap hijau sementara satu
file berisiko jatuh ke nol — itu persis keadaan 25 September — jadi yang
berisiko dijaga terpisah.

**Dua jalur tanpa akhir ditutup, bukan hanya dites:**

- Orchestrator menangkap lemparan adapter per batch dan memperlakukannya sebagai
  batch gagal: job berakhir `partial`, jawaban lain tetap tersimpan. Lemparan
  tidak diulang; hanya balasan yang melanggar format yang diminta sekali lagi
  (ADR-0016).
- `runJob` menangkap lemparan apa pun setelah klaim dan menandai job `failed`
  dengan pesan "Analisis berhenti karena kesalahan tak terduga". Kalau penandaan
  itu sendiri gagal, sweeper tetap menjadi jaring terakhir.
- Update status akhir yang ditolak database sekarang dikembalikan sebagai error
  dan masuk log (`analysis.job.finish_unrecorded`). Job-nya tidak ditandai
  `failed`: hasilnya sudah tersimpan dan penulisannya ke baris yang sama.

## Consequences

- PR yang menurunkan coverage `modules/` + `lib/` di bawah 80% gagal di CI.
  Jaraknya tipis (81,34%), jadi service baru tanpa tes akan langsung terasa. Itu
  maksudnya: aturan "setiap function di `modules/*/services/` punya unit test"
  sudah ada di OVERVIEW, sekarang ada yang menagih.
- Gerbang hanya melihat `modules/**` dan `lib/**`. **`app/api/_lib/` tidak
  diukur**, padahal di sana laporan dirakit dan arsip dibuat. Diukur sekali
  dengan folder itu ikut: 77,26% secara keseluruhan, `app/api/_lib` sendiri
  36%. PR ini menambah tes untuk `report-data.ts`; `organization-archive.ts`,
  `preview-with-modes.ts` dan `image-upload.ts` masih 0% (DEBT).
- Komponen React tidak dihitung dan tidak dikejar. Risikonya ada di alur job dan
  angka laporan, bukan di markup.
- Job yang berakhir `failed` karena lemparan tak terduga tidak lagi menunggu
  sweeper, dan notifikasi "analisis gagal" terkirim saat itu juga.

## Alternatives considered

- **Opsi B di rencana: 80% sebagai aspirasi, lepas dari CI.** Ditolak. Setelah
  D.1 angkanya memang 81%; melepasnya sekarang berarti membiarkannya turun lagi
  tanpa ada yang tahu, seperti sebelumnya.
- **Turunkan ambang ke angka terukur lalu naikkan bertahap.** Tidak perlu:
  angka terukur sudah di atas ambang yang tertulis.
- **Masukkan `app/api/_lib` ke gerbang sekarang.** Jujur soal cakupan, tapi
  butuh tes untuk arsip zip dan unggah gambar lebih dulu, atau ambang yang
  diturunkan ke 77%. Dicatat sebagai utang dengan angkanya, tidak disembunyikan.
- **Ambang per file untuk semua file.** Membuat file tipe dan klien Supabase
  yang memang tidak dites menggagalkan CI; lantai khusus cukup untuk file yang
  berisiko.
- **`pnpm check` menjalankan coverage.** Menambah sekitar satu menit ke setiap
  commit untuk hal yang CI sudah periksa di setiap PR.

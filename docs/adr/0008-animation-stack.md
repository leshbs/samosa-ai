# 0008. GSAP di samping motion, dimuat belakangan

- **Status:** Accepted
- **Date:** 2026-09-27

## Context

Redesign landing page dan beranda mengikuti `design_system.md` meminta halaman
terasa hidup tanpa mengorbankan performa, dan secara eksplisit menyebut
Watermelon UI, GSAP, dan framer-motion.

Aplikasi sudah memakai `motion` (framer-motion) lewat `LazyMotion strict` dan
elemen `m.*`, dengan feature bundle yang dimuat setelah hidrasi
(`components/motion/`). Yang belum ada: animasi yang progresnya adalah fungsi
dari **posisi scroll** atau **posisi pointer** — product shot yang merata saat
digulir, rel langkah "Cara kerja" yang terisi, kartu laporan di banner yang
miring mengikuti kursor. Di motion, itu berarti scroll listener per elemen dan
`useScroll` dari barrel `motion/react`, yang sebelumnya terukur menambah
±45 kB first-load JS per route.

Watermelon UI didistribusikan sebagai registry shadcn untuk Tailwind v4 dan
`motion` versi penuh. Komponen `avatar-group`-nya mengimpor `motion` langsung
(melempar error di bawah `LazyMotion strict`), memakai spring, dan membawa
`@floating-ui`. `browser`-nya adalah browser tiruan lengkap dengan sebelas state.

## Decision

1. **GSAP untuk scroll dan pointer, motion untuk state komponen.** Pembagiannya
   tertulis di `components/motion/use-gsap.ts`: motion menganimasikan kartu
   masuk, angka menghitung, hover; GSAP (ScrollTrigger, `quickTo`) menganimasikan
   hal yang di-scrub terhadap scroll atau mengikuti pointer. CSS keyframes untuk
   entrance di first paint (headline hero, sapaan beranda) dan loop tanpa akhir
   (marquee), karena keduanya tidak boleh menunggu JavaScript.

2. **GSAP dimuat dengan dynamic import, bukan `@gsap/react`.** `useGsap()`
   menunggu `requestIdleCallback`, lalu mengimpor `gsap` (dan `ScrollTrigger`
   hanya jika diminta) ke chunk terpisah. Kontrak cleanup sama dengan `useGSAP`:
   semua tween dibuat di dalam `gsap.matchMedia(root)` dan di-`revert()` saat
   unmount. Semua timeline berada di balik
   `(prefers-reduced-motion: no-preference)`.

3. **State progres-0 = state yang dirender server.** Karena GSAP tiba setelah
   first paint, kemiringan awal product shot ditulis di CSS (`.shot-tilt`), dan
   animasi yang bergeser dari posisi awal hanya dipakai untuk elemen di bawah
   fold. Tidak ada lompatan saat chunk tiba.

4. **Watermelon UI di-port, bukan di-install.** `marquee`, `status-indicator`,
   dan chrome dari `browser` di-port ke Tailwind v3 dan token proyek; hover lift
   `avatar-group` dibangun ulang di atas `m.li` dengan easing, bukan spring.
   Setiap file port mencatat apa yang diubah dan kenapa.

## Consequences

- (+) First-load JS: `/` 149 kB, `/dashboard` 134 kB (shared 102 kB). GSAP core
  (±20 kB gzip) dan ScrollTrigger (±17 kB gzip) tidak ada di first-load route
  mana pun — terverifikasi dari `app-build-manifest.json`. Beranda tidak pernah
  meminta ScrollTrigger.
- (+) Headline hero (LCP) terlihat di frame pertama; tidak ada konten di atas
  fold yang menunggu hidrasi untuk muncul.
- (−) Dua library animasi berarti dua API untuk dipelajari. Mitigasinya
  pembagian peran yang tegas di atas, dan GSAP hanya dipakai di dua komponen
  (`landing-motion.tsx`, `banner-mockup.tsx`).
- (−) Port Watermelon tidak ikut update upstream. Diterima: komponennya kecil,
  dan versi upstream tidak cocok dengan setup proyek ini apa adanya.

## Alternatives considered

- **Motion saja (`useScroll`, `useTransform`)** — satu library, tetapi
  `useScroll` hanya ada di barrel `motion/react`, yang terukur menarik runtime
  penuh ke first-load, dan pola rel yang menyalakan node per ambang progres jauh
  lebih verbose tanpa ScrollTrigger.
- **`@gsap/react` + import statis** — idiomatik, tetapi ±37 kB gzip masuk
  first-load dan parse sebelum hidrasi untuk animasi yang baru bisa berjalan
  setelah pengguna menggulir.
- **Install Watermelon UI via shadcn CLI** — menghasilkan kode Tailwind v4 dan
  `motion` penuh yang harus ditulis ulang juga; port langsung lebih sedikit
  kerja dan lebih jujur tentang apa yang benar-benar dipakai.

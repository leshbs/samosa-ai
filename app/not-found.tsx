import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-4 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        404
      </p>
      <h1 className="text-2xl font-semibold">Halaman tidak ditemukan</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Alamat yang kamu buka tidak ada di SAMOSA.
      </p>
      <Link
        href="/"
        className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground"
      >
        Kembali ke beranda
      </Link>
    </main>
  )
}

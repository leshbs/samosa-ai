import Link from 'next/link'

export default function LandingPage() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 text-center">
      <p className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
        Report Automation Platform
      </p>
      <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">SAMOSA</h1>
      <p className="max-w-xl text-balance text-muted-foreground">
        Mengubah ratusan aspirasi menjadi insight yang mudah dipahami — dari CSV mentah ke
        laporan siap-print dalam hitungan menit.
      </p>
      <Link
        href="/dashboard"
        className="rounded-lg bg-primary px-5 py-2.5 font-medium text-primary-foreground"
      >
        Mulai analisis
      </Link>
    </main>
  )
}

import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { Reveal } from '@/components/motion/primitives'
import { Button } from '@/components/ui/button'

/**
 * design_system.md §11.2 · 10. The micro line swaps the spec's "Gratis untuk 3
 * analisis pertama" for things that are true today — there is no billing, and
 * the deletion promise is the privacy policy's.
 *
 * ink-600 on the banner's darkest stop is 5.1:1; the default muted ink-500
 * would not clear AA there.
 */
export function ClosingCta() {
  return (
    <section
      aria-labelledby="cta-title"
      className="px-4 pb-16 pt-4 sm:px-6 lg:px-10 lg:pb-24"
    >
      <Reveal className="mx-auto max-w-landing rounded-2xl bg-sand-200 bg-grad-banner px-6 py-14 text-center sm:px-10 lg:p-20">
        <h2
          id="cta-title"
          className="mx-auto max-w-[720px] text-balance text-[32px] font-extrabold leading-[1.1] tracking-[-0.025em] text-ink-900 dark:text-foreground sm:text-display-lg"
        >
          Rapat berikutnya, bawa laporannya.
        </h2>
        <p className="mx-auto mt-5 max-w-[560px] text-body-lg text-ink-600 dark:text-muted-foreground">
          Unggah satu file ekspor, dan dalam beberapa menit kamu punya laporan yang setiap
          angkanya bisa dipertanggungjawabkan.
        </p>
        <Button asChild size="lg" className="mt-8">
          <Link href="/signup">
            Mulai gratis
            <ArrowRight aria-hidden />
          </Link>
        </Button>
        <p className="mt-4 font-mono text-micro text-ink-600 dark:text-muted-foreground">
          Tanpa kartu kredit · File asli ikut terhapus bersama datasetnya
        </p>
      </Reveal>
    </section>
  )
}

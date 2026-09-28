import { ArrowRight } from 'lucide-react'
import Link from 'next/link'
import { BannerMockup, type MockupReport } from '@/components/dashboard/banner-mockup'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

/**
 * The tan banner (design_system.md §10.2): text 52%, report card 48%.
 *
 * One deliberate deviation from the spec's colours: the accent word is
 * ember-700, not ember-500. On the banner's darkest stop (#E5CDB4) ember-500 is
 * 1.99:1 — it fails even the 3:1 large-text bar, and §3.1 rule 5 says text on a
 * gradient must pass at its worst point. ember-700 is 4.33:1 there.
 *
 * `data-tilt-zone` lets the card inside react to the pointer anywhere over the
 * banner, not only over itself.
 */
export function HeroBanner({
  report,
  action,
}: {
  report: MockupReport
  action: { label: string; href: string }
}) {
  return (
    <section
      aria-labelledby="banner-title"
      data-tilt-zone
      className="enter-rise relative overflow-hidden rounded-2xl bg-sand-200 bg-grad-banner px-6 py-8 [animation-delay:120ms] sm:p-10"
    >
      <div className="grid items-center gap-8 lg:grid-cols-[52fr_48fr]">
        <div className="relative z-10 space-y-5">
          <Badge variant="eyebrow">Feedback intelligence</Badge>
          <h2
            id="banner-title"
            className="text-display-sm text-ink-900 dark:text-foreground lg:text-display-lg"
          >
            Ubah feedback
            <br />
            jadi <span className="text-ember-700 dark:text-ember-400">keputusan.</span>
          </h2>
          <p className="max-w-[48ch] text-body text-ink-600 dark:text-muted-foreground">
            Dari temuan ke bukti, pola, dan prioritas — setiap angka bisa ditelusuri
            sampai ke kutipan aslinya.
          </p>
          <Button asChild variant="dark" size="lg">
            <Link href={action.href}>
              {action.label}
              <ArrowRight aria-hidden />
            </Link>
          </Button>
        </div>

        <BannerMockup report={report} />
      </div>
    </section>
  )
}

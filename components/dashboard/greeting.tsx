import { Plus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'

/**
 * design_system.md §10.2. The ✦ is the brand motif and appears only here and in
 * the logo; it is ember-500 because at 36px it is large text (3.1:1 passes).
 *
 * The entrance is CSS, not framer-motion: this is the first thing on the page,
 * and a CSS animation starts on first paint instead of waiting for a bundle to
 * hydrate. The stagger is four steps of 60ms — enough to read as one gesture.
 */
export function Greeting({
  dateLabel,
  firstName,
  subline,
  canCreate,
}: {
  dateLabel: string
  firstName: string | null
  subline: string
  canCreate: boolean
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-5">
      <div className="min-w-0 space-y-2">
        <p className="enter-fade font-mono text-micro text-muted-foreground">
          {dateLabel}
        </p>
        <h1 className="enter-rise text-display-sm [animation-delay:60ms] sm:text-display-md">
          {firstName ? `Selamat datang, ${firstName}` : 'Selamat datang'}{' '}
          <span aria-hidden className="text-ember-500">
            ✦
          </span>
        </h1>
        <p className="enter-rise max-w-spine text-body text-muted-foreground [animation-delay:120ms]">
          {subline}
        </p>
      </div>

      {/* Hidden rather than disabled for viewers (§8.1): a dead button is more
          confusing than one that is not there. */}
      {canCreate ? (
        <Button asChild size="lg" className="enter-rise [animation-delay:180ms]">
          <Link href="/datasets/new">
            <Plus aria-hidden />
            Analisis Baru
          </Link>
        </Button>
      ) : null}
    </header>
  )
}

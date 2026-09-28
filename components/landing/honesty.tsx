import { ArrowRight, Minus, ShieldCheck } from 'lucide-react'
import Link from 'next/link'
import { DATA_PROMISES, LIMITS } from '@/components/landing/content'
import { Reveal, Stagger, StaggerItem } from '@/components/motion/primitives'

function Column({
  title,
  items,
  icon,
}: {
  title: string
  items: readonly string[]
  icon: 'limit' | 'promise'
}) {
  const Icon = icon === 'limit' ? Minus : ShieldCheck
  return (
    <div className="space-y-5">
      <h3 className="text-h3 text-sand-25">{title}</h3>
      <Stagger step={0.07}>
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item}>
              <StaggerItem className="flex gap-3 text-body text-sand-25/80">
                <Icon
                  aria-hidden
                  className={
                    icon === 'limit'
                      ? 'mt-1 size-4 shrink-0 text-ink-400'
                      : 'mt-1 size-4 shrink-0 text-teal-300'
                  }
                />
                {item}
              </StaggerItem>
            </li>
          ))}
        </ul>
      </Stagger>
    </div>
  )
}

/**
 * design_system.md §11.2 · 07 — the section the spec calls the most direct
 * embodiment of the product's character. Stating the limits on the landing
 * page filters out the people who would be disappointed later, and that is
 * the point.
 *
 * sand-25 on ink-950 is 17.9:1; the body at 80% opacity is still above 12:1.
 */
export function Honesty() {
  return (
    <section
      id="batasan"
      aria-labelledby="honesty-title"
      className="scroll-mt-20 px-4 py-16 sm:px-6 lg:px-10 lg:py-24"
    >
      <div className="mx-auto max-w-landing rounded-2xl bg-ink-950 bg-grad-sidebar px-6 py-12 text-sand-25 sm:px-10 lg:p-16">
        <Reveal className="max-w-spine space-y-4">
          <p className="eyebrow text-ember-500">Yang perlu kamu tahu</p>
          <h2
            id="honesty-title"
            className="text-balance text-[32px] font-extrabold leading-[1.1] tracking-[-0.025em] sm:text-display-lg"
          >
            Data kamu aman, dan ada batasan yang jelas.
          </h2>
        </Reveal>

        <div className="mt-12 grid gap-12 border-t border-white/[0.08] pt-12 md:grid-cols-2 md:gap-16">
          <Column title="Batas saat ini" items={LIMITS} icon="limit" />
          <Column title="Tentang data kamu" items={DATA_PROMISES} icon="promise" />
        </div>

        <Link
          href="/privacy"
          className="group mt-12 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-sand-25 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950"
        >
          Selengkapnya di halaman privasi
          <ArrowRight
            aria-hidden
            className="size-4 transition-transform duration-fast group-hover:translate-x-0.5"
          />
        </Link>
      </div>
    </section>
  )
}

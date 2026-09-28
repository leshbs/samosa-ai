import { TESTIMONIALS } from '@/components/landing/content'
import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/motion/primitives'

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((word) => word[0] ?? '')
    .join('')
    .toUpperCase()
}

/**
 * design_system.md §11.2 · 08: a 2-column grid of borderless sand-50 cards.
 *
 * Renders nothing while `TESTIMONIALS` is empty — which it is, deliberately,
 * until there are real quotes from real people who agreed to be quoted. See
 * content.ts.
 */
export function Testimonials() {
  if (TESTIMONIALS.length === 0) return null

  return (
    <section
      aria-labelledby="testimonials-title"
      className="px-6 py-16 lg:px-10 lg:py-28"
    >
      <div className="mx-auto max-w-landing space-y-14">
        <SectionHeading
          id="testimonials-title"
          eyebrow="Kata mereka"
          title="Dari yang sudah membawanya ke rapat."
        />
        <Stagger className="grid gap-5 md:grid-cols-2" step={0.08}>
          {TESTIMONIALS.map((item) => (
            <StaggerItem key={item.name}>
              <figure className="flex h-full flex-col justify-between gap-6 rounded-xl bg-alt p-7">
                <blockquote className="text-body">“{item.quote}”</blockquote>
                <figcaption className="flex items-center gap-3">
                  <span
                    aria-hidden
                    className="flex size-9 items-center justify-center rounded-full bg-sand-200 text-[12px] font-bold text-ink-700"
                  >
                    {initials(item.name)}
                  </span>
                  <span>
                    <span className="block text-sm font-semibold">{item.name}</span>
                    <span className="block text-body-sm text-ink-600 dark:text-muted-foreground">
                      {item.role}
                    </span>
                  </span>
                </figcaption>
              </figure>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}

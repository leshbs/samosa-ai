import { STEPS } from '@/components/landing/content'
import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/motion/primitives'

/**
 * design_system.md §11.2 · 05. Each card carries one real technical detail —
 * the upload limit, the cost estimate, the evidence link — because that is
 * what separates "we are serious" from "we have a landing page".
 *
 * On desktop a rail with one node per step sits above the cards and fills as
 * the section scrolls through the viewport (landing-motion.tsx); as the fill
 * reaches a node, that node and its card's ghost number turn Ember. Without
 * motion the rail stays empty and the numbers stay ghosted — the static state
 * is the spec's design, and the motion only adds to it.
 */
export function HowItWorks() {
  return (
    <section
      id="cara-kerja"
      aria-labelledby="steps-title"
      className="scroll-mt-20 px-6 py-16 lg:px-10 lg:py-28"
    >
      <div className="mx-auto max-w-landing space-y-14">
        <SectionHeading
          id="steps-title"
          eyebrow="Cara kerja"
          title="Dari ekspor Google Forms ke laporan, tiga langkah."
        />

        <div data-gsap="steps" className="space-y-8">
          <div aria-hidden className="relative hidden h-3 md:block">
            <div className="absolute left-[16.66%] right-[16.66%] top-1/2 h-px -translate-y-1/2 bg-border">
              <div
                data-gsap="steps-line"
                className="h-full origin-left scale-x-0 bg-ember-500"
              />
            </div>
            {STEPS.map((step, index) => (
              <span
                key={step.number}
                data-gsap="step-node"
                className="absolute top-0 size-3 -translate-x-1/2 rounded-full border-2 border-ink-300 bg-background transition-colors duration-slow data-[active]:border-ember-500 data-[active]:bg-ember-500"
                style={{ left: `${16.66 + index * 33.33}%` }}
              />
            ))}
          </div>

          <Stagger className="grid gap-5 md:grid-cols-3" step={0.08}>
            {STEPS.map((step) => (
              <StaggerItem key={step.number} className="h-full">
                <article
                  data-gsap="step"
                  className="group/step flex h-full flex-col rounded-card border bg-card p-6"
                >
                  <p
                    aria-hidden
                    className="text-[48px] font-extrabold leading-none tracking-[-0.03em] text-sand-300 transition-colors duration-slow group-data-[active]/step:text-ember-500 dark:text-ink-700"
                  >
                    {step.number}
                  </p>
                  <h3 className="mt-5 text-h3">
                    <span className="sr-only">Langkah {Number(step.number)}: </span>
                    {step.title}
                  </h3>
                  <p className="mt-2 text-body-sm text-muted-foreground">{step.body}</p>
                  <div className="mt-auto pt-5">
                    <p className="border-t pt-4 font-mono text-[12px] leading-relaxed text-ink-600 dark:text-muted-foreground">
                      {step.detail}
                    </p>
                  </div>
                </article>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </div>
    </section>
  )
}

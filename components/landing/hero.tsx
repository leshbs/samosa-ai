import { CalendarDays, GraduationCap, Megaphone, Users } from 'lucide-react'
import Link from 'next/link'
import { AvatarStack, type StackItem } from '@/components/ui/avatar-stack'
import { Button } from '@/components/ui/button'

const PLAIN_WORDS = ['Ubah', 'ratusan', 'aspirasi', 'jadi'] as const
const ACCENT_WORDS = ['laporan', 'siap', 'presentasi.'] as const

const AUDIENCE: readonly StackItem[] = [
  {
    label: 'OSIS',
    icon: <Megaphone aria-hidden />,
    tone: 'bg-ember-100 text-ember-700',
  },
  { label: 'MPK', icon: <Users aria-hidden />, tone: 'bg-teal-100 text-teal-700' },
  {
    label: 'Panitia acara',
    icon: <CalendarDays aria-hidden />,
    tone: 'bg-sand-200 text-ink-700',
  },
  {
    label: 'Guru pembina',
    icon: <GraduationCap aria-hidden />,
    tone: 'bg-ink-900 text-sand-25 dark:bg-sand-25 dark:text-ink-900',
  },
]

/** 60ms per word: the headline arrives as one gesture, read left to right. */
const WORD_STEP = 60

/**
 * design_system.md §11.2 · 02.
 *
 * The headline is the page's largest paint, so its entrance is CSS keyframes
 * and not JavaScript: it starts on the first frame the browser draws and does
 * not wait for hydration or for the animation chunk. Each word is its own
 * inline-block so it can rise independently, and the h1 still reads as one
 * sentence to assistive technology.
 *
 * "laporan siap-cetak" is the one gradient phrase: at ≥40px it meets §3.3's
 * size floor on every breakpoint, including phones (40px, not the 34px display
 * step). The phrase is nowrap so "siap-" never ends a line.
 *
 * The glow behind is `data-gsap="glow"`: landing-motion.tsx drifts it up as the
 * hero scrolls away.
 */
export function Hero() {
  const words = [...PLAIN_WORDS, ...ACCENT_WORDS]

  return (
    <section
      data-gsap="hero"
      className="relative overflow-hidden px-6 pb-40 pt-16 sm:pt-24 lg:px-10 lg:pb-48 lg:pt-32"
    >
      <div
        aria-hidden
        data-gsap="glow"
        className="pointer-events-none absolute inset-x-0 top-0 h-[640px] bg-grad-hero-glow"
      />

      <div className="relative mx-auto max-w-[720px] text-center">
        <p className="enter-fade eyebrow text-ember-700 dark:text-ember-400">
          Asisten analisis feedback
        </p>

        <h1 className="mt-5 text-balance text-[40px] font-extrabold leading-[1.04] tracking-[-0.03em] sm:text-display-lg lg:text-display-xl">
          {words.map((word, index) => (
            <span key={word}>
              <span
                className={
                  index >= PLAIN_WORDS.length
                    ? 'enter-rise text-grad-ember inline-block whitespace-nowrap pb-1'
                    : 'enter-rise inline-block'
                }
                style={{ animationDelay: `${80 + index * WORD_STEP}ms` }}
              >
                {word}
              </span>
              {index < words.length - 1 ? ' ' : null}
            </span>
          ))}
        </h1>

        <p
          className="enter-rise mx-auto mt-6 max-w-[620px] text-pretty text-body-lg text-muted-foreground"
          style={{ animationDelay: '420ms' }}
        >
          Unggah ekspor Google Forms, dapatkan analisis sentimen, topik, dan ringkasan
          yang setiap angkanya bisa ditelusuri sampai ke kutipan aslinya.
        </p>

        <div
          className="enter-rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: '500ms' }}
        >
          <Button asChild variant="bright" size="lg">
            <Link href="/signup">Mulai gratis</Link>
          </Button>
          <span className="text-body-sm text-muted-foreground">— tanpa perlu bayar</span>
        </div>

        <div
          className="enter-fade mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row"
          style={{ animationDelay: '620ms' }}
        >
          <AvatarStack items={AUDIENCE} />
          <p className="text-body-sm text-muted-foreground">
            Dibuat untuk OSIS, MPK, panitia acara, dan guru pembinanya
          </p>
        </div>
      </div>
    </section>
  )
}

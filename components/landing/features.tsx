import { ArrowRight, Check } from 'lucide-react'
import Link from 'next/link'
import {
  ConditionVisual,
  ExportVisual,
  InsightVisual,
} from '@/components/landing/feature-visuals'
import { SectionHeading } from '@/components/landing/section-heading'
import { Reveal, Stagger, StaggerItem } from '@/components/motion/primitives'
import { cn } from '@/lib/utils'

const FEATURES = [
  {
    eyebrow: 'Bukti',
    title: 'Setiap angka ada buktinya',
    body: 'Insight di laporan mengutip aspirasi aslinya, bukan merangkum tanpa jejak. Kalau ada yang bertanya "siapa yang bilang begitu?", jawabannya satu klik.',
    checklist: [
      'Insight mengutip aspirasi asli',
      'Klik angka mana pun sampai ke kutipannya',
      'Jelajahi semua aspirasi dengan filter',
    ],
    link: { label: 'Lihat contoh laporan', href: '#contoh' },
    visual: <InsightVisual />,
  },
  {
    eyebrow: 'Kejujuran data',
    title: 'Yang tidak diketahui, disebutkan',
    body: 'Laporan yang terlihat sempurna biasanya menyembunyikan sesuatu. SAMOSA menyebut berapa yang gagal dianalisis, berapa yang tidak punya topik, dan versi prompt yang dipakai.',
    checklist: [
      'Jumlah yang gagal ditampilkan',
      'Aspirasi tanpa topik ikut dihitung',
      'Versi prompt tercatat di setiap hasil',
    ],
    link: { label: 'Baca batasannya', href: '#batasan' },
    visual: <ConditionVisual />,
  },
  {
    eyebrow: 'Ekspor',
    title: 'Laporan yang siap dibawa ke rapat',
    body: 'PDF yang rapi saat dicetak, dan CSV lengkap untuk yang ingin mengolah sendiri. Setiap grafik punya tabelnya, jadi printer hitam-putih pun tetap terbaca.',
    checklist: [
      'Ekspor PDF berhalaman',
      'CSV dengan tag lengkap',
      'Setiap grafik punya tabel',
    ],
    link: { label: 'Coba dengan datamu', href: '/signup' },
    visual: <ExportVisual />,
  },
] as const

/**
 * design_system.md §11.2 · 06: three blocks, text 5 columns and visual 6 with
 * one between, alternating sides. The visuals carry `data-gsap="parallax"` —
 * they drift a few pixels against the scroll on desktop, which is what makes a
 * flat page read as layered.
 */
export function Features() {
  return (
    <section
      id="fitur"
      aria-labelledby="features-title"
      className="scroll-mt-20 bg-alt px-6 py-16 lg:px-10 lg:py-28"
    >
      <div className="mx-auto max-w-landing space-y-20 lg:space-y-28">
        <SectionHeading
          id="features-title"
          eyebrow="Fitur"
          title="Dibuat untuk laporan yang akan dipertanyakan orang."
          onAlt
        />

        {FEATURES.map((feature, index) => {
          const flipped = index % 2 === 1
          return (
            <div key={feature.title} className="grid items-center gap-10 lg:grid-cols-12">
              <Reveal
                className={cn(
                  'space-y-5 lg:col-span-5',
                  flipped ? 'lg:col-start-8 lg:row-start-1' : 'lg:col-start-1',
                )}
              >
                <p className="eyebrow text-ember-700 dark:text-ember-400">
                  {feature.eyebrow}
                </p>
                <h3 className="text-h2">{feature.title}</h3>
                <p className="text-body text-ink-600 dark:text-muted-foreground">
                  {feature.body}
                </p>
                <Stagger className="space-y-2.5" step={0.06}>
                  <ul className="space-y-2.5">
                    {feature.checklist.map((item) => (
                      <li key={item}>
                        <StaggerItem className="flex items-center gap-2.5 text-body-sm font-medium">
                          <Check
                            aria-hidden
                            className="size-3.5 shrink-0 text-teal-500"
                            strokeWidth={3}
                          />
                          {item}
                        </StaggerItem>
                      </li>
                    ))}
                  </ul>
                </Stagger>
                <Link
                  href={feature.link.href}
                  className="group inline-flex items-center gap-1.5 rounded-md text-sm font-semibold text-ink-900 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-foreground"
                >
                  {feature.link.label}
                  <ArrowRight
                    aria-hidden
                    className="size-4 transition-transform duration-fast group-hover:translate-x-0.5"
                  />
                </Link>
              </Reveal>

              <div
                className={cn(
                  'lg:col-span-6',
                  flipped ? 'lg:col-start-1 lg:row-start-1' : 'lg:col-start-7',
                )}
              >
                <div data-gsap="parallax" className="mx-auto max-w-[520px]">
                  {feature.visual}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

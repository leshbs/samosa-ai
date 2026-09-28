import { GALLERY } from '@/components/landing/content'
import { SectionHeading } from '@/components/landing/section-heading'
import { Stagger, StaggerItem } from '@/components/motion/primitives'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

const SENTIMENT_BARS = ['bg-positive', 'bg-attention', 'bg-negative'] as const

/**
 * design_system.md §11.2 · 09, relabelled. The spec's eyebrow is "DIBUAT
 * DENGAN SAMOSA" over real customer reports; there are none to show, so these
 * are samples and every card says so. The thumbnails alternate Ember, teal and
 * sand tints as specified.
 *
 * Hover lifts a card by 4px in CSS — cheaper than a framer gesture for
 * something this simple — while framer staggers the three in as they scroll
 * into view.
 */
export function ReportGallery() {
  return (
    <section
      id="contoh"
      aria-labelledby="gallery-title"
      className="scroll-mt-20 bg-alt px-6 py-16 lg:px-10 lg:py-28"
    >
      <div className="mx-auto max-w-landing space-y-14">
        <SectionHeading
          id="gallery-title"
          eyebrow="Contoh laporan"
          title="Satu format, banyak jenis kegiatan."
          sub="Dari pensi sampai kantin, laporannya punya bentuk yang sama — ringkasan, bukti, dan batasannya. Data di bawah ini contoh."
          onAlt
        />

        <Stagger className="grid gap-5 md:grid-cols-3" step={0.08}>
          {GALLERY.map((report) => (
            <StaggerItem key={report.title} className="h-full">
              <article className="group h-full overflow-hidden rounded-xl border bg-card transition-[transform,box-shadow] duration-base ease-soft hover:-translate-y-1 hover:shadow-md">
                <div aria-hidden className={cn('space-y-4 p-6', report.tint)}>
                  <div className="flex h-2.5 overflow-hidden rounded-full bg-white/70 dark:bg-black/20">
                    {report.sentiment.map((share, index) => (
                      <span
                        key={index}
                        className={SENTIMENT_BARS[index]}
                        style={{ width: `${share}%` }}
                      />
                    ))}
                  </div>
                  <div className="space-y-2 rounded-lg bg-white/80 p-3 dark:bg-card/70">
                    {report.topics.map((width, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <span className="h-1.5 w-10 rounded-full bg-ink-200 dark:bg-ink-700" />
                        <span
                          className="h-1.5 rounded-r-sm bg-teal-500"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-1 border-t p-5">
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-h4 font-bold">{report.title}</h3>
                    <Badge variant="example" className="shrink-0">
                      Contoh
                    </Badge>
                  </div>
                  <p className="text-body-sm text-muted-foreground">
                    {report.organization}
                  </p>
                  <p className="font-mono text-micro text-muted-foreground">
                    {report.responses.toLocaleString('id-ID')} aspirasi
                  </p>
                </div>
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  )
}

import { ReportPreview } from '@/components/landing/report-preview'
import { Badge } from '@/components/ui/badge'
import { BrowserFrame } from '@/components/ui/browser-frame'

/**
 * design_system.md §11.2 · 03: the report page in a browser frame, pulled up
 * 64px… and then some, so it breaks through the bottom of the hero.
 *
 * Three nested layers, each owning one transform so none overrides another:
 *   - the outer div rises in on first paint (CSS `enter-rise`),
 *   - the perspective wrapper gives the tilt its depth,
 *   - `.shot-tilt` starts tilted back 10° in CSS, and GSAP flattens it as the
 *     page scrolls (landing-motion.tsx). Because the resting tilt is CSS, the
 *     first painted frame and GSAP's first frame are the same frame.
 */
export function ProductShot() {
  return (
    <div
      className="enter-rise relative z-10 mx-auto -mt-28 max-w-[1080px] px-4 sm:px-6 lg:-mt-32"
      style={{ animationDelay: '560ms' }}
    >
      <figure className="[perspective:1600px]">
        <div data-gsap="shot" className="shot-tilt">
          <BrowserFrame badge={<Badge variant="example">Data contoh</Badge>}>
            <ReportPreview />
          </BrowserFrame>
        </div>
        <figcaption className="sr-only">
          Contoh halaman laporan SAMOSA dengan data contoh: ringkasan angka, insight
          beserta nomor aspirasi yang menjadi buktinya, sebaran sentimen, dan topik
          teratas.
        </figcaption>
      </figure>
    </div>
  )
}

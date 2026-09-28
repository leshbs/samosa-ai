import { ClosingCta } from '@/components/landing/closing-cta'
import { Features } from '@/components/landing/features'
import { Hero } from '@/components/landing/hero'
import { Honesty } from '@/components/landing/honesty'
import { HowItWorks } from '@/components/landing/how-it-works'
import { LandingMotion } from '@/components/landing/landing-motion'
import { ProductShot } from '@/components/landing/product-shot'
import { ReportGallery } from '@/components/landing/report-gallery'
import { SiteFooter } from '@/components/landing/site-footer'
import { SiteNav } from '@/components/landing/site-nav'
import { Testimonials } from '@/components/landing/testimonials'
import { TrustStrip } from '@/components/landing/trust-strip'

/**
 * design_system.md §11: centered hero → product proof → trust strip → how it
 * works → alternating features → honesty → testimonials → examples → closing
 * CTA. Section backgrounds alternate cream and sand-50 (§11.3) so the eye gets
 * a rest between sections.
 *
 * A Server Component throughout. The JavaScript on this page is the nav, the
 * framer-motion reveals, and one GSAP island (LandingMotion) whose runtime is
 * fetched after the page is idle — none of it is needed to read the page.
 */
export default function LandingPage() {
  return (
    <div className="relative min-h-screen bg-background">
      <SiteNav />
      <LandingMotion>
        <main>
          <Hero />
          <ProductShot />
          <div className="h-16 lg:h-24" />
          <TrustStrip />
          <HowItWorks />
          <Features />
          <Honesty />
          <Testimonials />
          <ReportGallery />
          <div className="h-16 lg:h-24" />
          <ClosingCta />
        </main>
      </LandingMotion>
      <SiteFooter />
    </div>
  )
}

import { Logo } from '@/components/brand/logo'
import { LegalFooter } from '@/components/layout/legal-footer'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-muted/40 p-4">
      {/* §5 wants a way back from everywhere, including the doors. */}
      <Logo />
      <div className="w-full max-w-sm rounded-card border bg-card p-6 shadow-card">
        {children}
      </div>
      {/* Right under the sign-up form: the moment someone decides to trust us. */}
      <LegalFooter />
    </div>
  )
}

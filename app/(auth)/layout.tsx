import { LegalFooter } from '@/components/layout/legal-footer'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-muted/40 p-4">
      <div className="w-full max-w-sm rounded-xl border bg-card p-6 shadow-sm">
        {children}
      </div>
      {/* Right under the sign-up form: the moment someone decides to trust us. */}
      <LegalFooter />
    </div>
  )
}

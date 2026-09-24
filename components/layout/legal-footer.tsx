import Link from 'next/link'

/**
 * The privacy policy has to be reachable from wherever someone decides to
 * trust the product with their data — the landing page, the sign-up form, and
 * from inside the app where the uploading actually happens.
 */
export function LegalFooter({ className }: { className?: string }) {
  return (
    <footer
      className={`flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground ${className ?? ''}`}
    >
      <span>© {new Date().getFullYear()} SAMOSA</span>
      <Link href="/privacy" className="hover:text-foreground">
        Kebijakan Privasi
      </Link>
      <Link href="/terms" className="hover:text-foreground">
        Ketentuan Layanan
      </Link>
    </footer>
  )
}

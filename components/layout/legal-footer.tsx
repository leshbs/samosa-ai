import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * The privacy policy has to be reachable from wherever someone decides to
 * trust the product with their data — the landing page, the sign-up form, and
 * from inside the app where the uploading actually happens.
 */
export function LegalFooter({ className, ...props }: React.ComponentProps<'footer'>) {
  return (
    <footer
      className={cn(
        'flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-muted-foreground',
        className,
      )}
      {...props}
    >
      <span>© {new Date().getFullYear()} SAMOSA</span>
      <Link href="/privacy" className="hover:text-foreground hover:underline">
        Kebijakan Privasi
      </Link>
      <Link href="/terms" className="hover:text-foreground hover:underline">
        Ketentuan Layanan
      </Link>
    </footer>
  )
}

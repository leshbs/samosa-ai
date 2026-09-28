import { cn } from '@/lib/utils'

/**
 * The window chrome from Watermelon UI's `browser`, and only the chrome.
 *
 * The original is a working browser — tabs, history, bookmarks, a download
 * simulator, eleven pieces of state and a dozen lucide icons — all of which a
 * static product screenshot would ship to every landing-page visitor and never
 * use. What design_system.md §11.2 asks for is three dots and an empty address
 * bar, which is a Server Component and zero bytes of JavaScript.
 *
 * The dots are warm neutrals rather than macOS red/amber/green: three
 * saturated colours in the corner of the hero would out-shout the one Ember
 * button the page is built around.
 */
export function BrowserFrame({
  children,
  badge,
  className,
}: {
  children: React.ReactNode
  /** Right-aligned in the toolbar — used to mark sample data as sample. */
  badge?: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border bg-card shadow-lg dark:shadow-[0_20px_48px_rgba(0,0,0,.5)]',
        className,
      )}
    >
      <div className="flex items-center gap-4 border-b bg-sand-50 px-4 py-3 dark:bg-secondary">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-ink-300" />
          <span className="size-2.5 rounded-full bg-ink-200" />
          <span className="size-2.5 rounded-full bg-ink-200" />
        </span>
        <span
          aria-hidden
          className="mx-auto hidden h-6 w-full max-w-sm rounded-md border bg-card sm:block"
        />
        <span className="ml-auto sm:ml-0">{badge}</span>
      </div>
      {children}
    </div>
  )
}

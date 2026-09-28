import Link from 'next/link'
import { cn } from '@/lib/utils'

/**
 * The samosa mark from app/icon.svg — a samosa outline holding one voice in
 * front of two others. The orange is drawn inside the SVG rather than as a CSS
 * background: print strips backgrounds (globals.css), and a cream outline on
 * no background would vanish on white paper.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex size-[34px] shrink-0 overflow-hidden rounded-md',
        className,
      )}
    >
      <svg viewBox="0 0 32 32" className="size-full">
        <rect width="32" height="32" fill="#E8701A" />
        <path
          d="M16 4.46 28.1 25.69H3.9Z"
          fill="none"
          stroke="#FDF6EE"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        <circle cx="11.73" cy="21.38" r="2.19" fill="#F8DCC4" />
        <circle cx="20.27" cy="21.38" r="2.19" fill="#F8DCC4" />
        <circle cx="16" cy="17.56" r="4.26" fill="#FDF6EE" />
      </svg>
    </span>
  )
}

/**
 * Mark plus wordmark. `onDark` is the sidebar and footer; the "AI" suffix is
 * ember-500 there (6.2:1 on ink-950) and ember-700 on cream, where -500 would
 * be 3.1:1 at 11px.
 */
export function Logo({
  href = '/',
  tone = 'onLight',
  className,
}: {
  href?: string
  tone?: 'onLight' | 'onDark'
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label="SAMOSA — beranda"
      className={cn(
        'inline-flex items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        tone === 'onDark'
          ? 'focus-visible:ring-offset-ink-950'
          : 'focus-visible:ring-offset-background',
        className,
      )}
    >
      <LogoMark />
      <span className="flex items-baseline gap-1" aria-hidden>
        <span
          className={cn(
            'text-[17px] font-extrabold tracking-[-0.02em]',
            tone === 'onDark' ? 'text-white' : 'text-foreground',
          )}
        >
          SAMOSA
        </span>
        <span
          className={cn(
            'text-[11px] font-semibold',
            tone === 'onDark' ? 'text-ember-500' : 'text-ember-700 dark:text-ember-400',
          )}
        >
          AI
        </span>
      </span>
    </Link>
  )
}

import { cn } from '@/lib/utils'

/** "Rani Putri" → "RP", "rani@osis.test" → "R". Never empty. */
export function initialsOf(name: string): string {
  const words = name
    .replace(/@.*$/, '')
    .split(/[\s._-]+/)
    // "OSIS 2026" is OSIS: a year or a number makes a poor initial.
    .filter((word) => word !== '' && !/^\d+$/.test(word))
  const letters = words.length > 1 ? [words[0], words[words.length - 1]] : words
  const initials = letters
    .map((word) => word?.charAt(0) ?? '')
    .join('')
    .toUpperCase()
  return initials || '?'
}

const SIZES = {
  sm: 'size-8 text-xs',
  md: 'size-10 text-sm',
  lg: 'size-16 text-lg',
} as const

/**
 * A photo when there is one, initials when there is not (checklist 5.8). The
 * initials are not a placeholder for a missing picture — most accounts will
 * never upload one, so this is the normal case and it has to look finished.
 *
 * Decorative: the name is always printed next to it, so the image carries no
 * information a screen reader needs.
 */
export function UserAvatar({
  name,
  imageUrl,
  size = 'md',
  shape = 'circle',
  className,
}: {
  name: string
  imageUrl?: string | null
  size?: keyof typeof SIZES
  shape?: 'circle' | 'square'
  className?: string
}) {
  const rounded = shape === 'circle' ? 'rounded-full' : 'rounded-lg'

  if (imageUrl) {
    return (
      // A signed, short-lived Supabase URL: next/image would cache it past its
      // expiry and needs the storage host allow-listed for no gain here.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt=""
        aria-hidden
        className={cn(SIZES[size], rounded, 'shrink-0 border object-cover', className)}
      />
    )
  }

  return (
    <span
      aria-hidden
      className={cn(
        SIZES[size],
        rounded,
        'flex shrink-0 items-center justify-center bg-secondary font-semibold text-secondary-foreground',
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  )
}

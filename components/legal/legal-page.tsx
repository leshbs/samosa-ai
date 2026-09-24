import Link from 'next/link'
import { isPlaceholder } from '@/lib/legal/controller'

export type Language = 'id' | 'en'

export function resolveLanguage(value: string | undefined): Language {
  return value === 'en' ? 'en' : 'id'
}

/**
 * Language is a search param, not React state.
 *
 * A legal page has to be quotable: someone sends a link to the English terms
 * and the recipient must see the English terms. A `useState` toggle gives
 * every reader the same URL and a different page, and needs JavaScript to show
 * text that should be readable without it.
 */
export function LanguageSwitch({ path, current }: { path: string; current: Language }) {
  const options: Array<{ code: Language; label: string }> = [
    { code: 'id', label: 'Bahasa Indonesia' },
    { code: 'en', label: 'English' },
  ]

  return (
    <div className="flex gap-1 rounded-md border p-0.5 text-xs" role="group">
      {options.map((option) => (
        <Link
          key={option.code}
          href={option.code === 'id' ? path : `${path}?lang=en`}
          aria-current={current === option.code ? 'true' : undefined}
          className={
            current === option.code
              ? 'rounded bg-secondary px-2.5 py-1 font-medium text-secondary-foreground'
              : 'rounded px-2.5 py-1 text-muted-foreground hover:text-foreground'
          }
        >
          {option.label}
        </Link>
      ))}
    </div>
  )
}

/**
 * Shown until `CONTROLLER` is filled in. Deliberately loud and deliberately
 * in the page rather than in a comment: an unfinished privacy policy is a
 * compliance problem, and the only reliable place to surface it is where
 * someone will actually look.
 */
export function DraftNotice({ language }: { language: Language }) {
  if (!isPlaceholder()) return null

  return (
    <div
      role="note"
      className="mb-8 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm"
    >
      <p className="font-medium">
        {language === 'id' ? 'Draf — belum siap dipakai' : 'Draft — not ready for use'}
      </p>
      <p className="mt-1 text-muted-foreground">
        {language === 'id'
          ? 'Dokumen ini belum menyebut penanggung jawab data dan alamat kontak yang sebenarnya, dan belum ditinjau oleh ahli hukum. Isi lib/legal/controller.ts sebelum aplikasi ini dipakai pengguna sungguhan.'
          : 'This document does not yet name a real data controller or contact address, and has not been reviewed by a lawyer. Fill in lib/legal/controller.ts before this application is used by real people.'}
      </p>
    </div>
  )
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string
  children: React.ReactNode
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{heading}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  )
}

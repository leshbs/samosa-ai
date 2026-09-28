'use client'

/**
 * Last resort: this replaces the root layout, so it renders its own `<html>`
 * and cannot use the theme provider, the fonts, or any Tailwind class that
 * depends on CSS variables the layout would have set. Everything here is
 * inline on purpose — if the layout itself is what crashed, a stylesheet is
 * not guaranteed to have loaded.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="id">
      <body
        style={{
          fontFamily: 'system-ui, sans-serif',
          display: 'flex',
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.75rem',
          margin: 0,
          padding: '1rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0 }}>
          SAMOSA gagal dimuat
        </h1>
        <p style={{ margin: 0, maxWidth: '24rem', color: '#6b6963' }}>
          Terjadi kesalahan yang tidak bisa dipulihkan di halaman ini. Muat ulang untuk
          mencoba lagi.
        </p>
        {error.digest ? (
          <code style={{ fontSize: '0.75rem', color: '#6b6963' }}>{error.digest}</code>
        ) : null}
        <button
          onClick={reset}
          style={{
            cursor: 'pointer',
            borderRadius: '0.5rem',
            border: '1px solid #c3c2b7',
            background: 'transparent',
            padding: '0.5rem 1rem',
            font: 'inherit',
          }}
        >
          Muat ulang
        </button>
      </body>
    </html>
  )
}

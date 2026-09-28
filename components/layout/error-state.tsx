'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export type ErrorStateProps = {
  error: Error & { digest?: string }
  reset: () => void
  title?: string
  description?: string
}

/**
 * Shared body for every error boundary.
 *
 * Next redacts `error.message` in production and replaces it with a `digest`
 * that matches the server-side stack trace, so the message is never worth
 * showing: in production it says nothing, and in development it can carry a
 * query fragment or a row value. The digest is what a user can quote back to
 * us, so that is what the card prints.
 */
export function ErrorState({
  error,
  reset,
  title = 'Ada yang tidak beres',
  description = 'Halaman ini gagal dimuat. Coba lagi — kalau masih gagal, kabari kami dengan kode di bawah.',
}: ErrorStateProps) {
  useEffect(() => {
    // Boundaries run in the browser; the structured logger writes to stdout,
    // which nobody is reading here. The console is the only sink available.
    console.error('samosa.render.failed', error.digest ?? '(no digest)')
  }, [error])

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <p className="font-medium">{title}</p>
        <p className="max-w-sm text-sm text-muted-foreground">{description}</p>
        {error.digest ? (
          <code className="rounded bg-secondary px-2 py-1 text-xs text-muted-foreground">
            {error.digest}
          </code>
        ) : null}
        <Button onClick={reset} variant="outline" size="sm">
          Coba lagi
        </Button>
      </CardContent>
    </Card>
  )
}

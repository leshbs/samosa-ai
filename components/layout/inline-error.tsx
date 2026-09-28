import { AlertTriangle } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

/**
 * §10 asks an error state to say three things: what failed, why, and how to fix
 * it. A bare red sentence — which is what these pages had — answers only the
 * first, and leaves the reader with a dead end.
 *
 * `what` comes from the failed `Result`, so it is already user-facing Indonesian.
 * `why` and `recovery` are supplied per call site, because only the caller knows
 * whether the fix is "reload", "check the file" or "ask an admin".
 */
export function InlineError({
  what,
  why = 'Biasanya ini gangguan sementara saat menghubungi basis data.',
  recovery = 'Muat ulang halaman ini. Kalau masih gagal, coba lagi beberapa menit lagi.',
}: {
  what: string
  why?: string
  recovery?: string
}) {
  return (
    <Card role="alert" className="border-destructive/40">
      <CardContent className="flex gap-3 py-5">
        <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{what}</p>
          <p className="text-sm text-muted-foreground">{why}</p>
          <p className="text-sm text-muted-foreground">{recovery}</p>
        </div>
      </CardContent>
    </Card>
  )
}

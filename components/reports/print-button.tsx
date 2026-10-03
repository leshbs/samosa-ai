'use client'

import { useEffect, useRef } from 'react'
import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * "Cetak" on the print page. The browser's print dialog also saves a PDF —
 * "Simpan sebagai PDF" is in every desktop and mobile browser, and the file is
 * named after the page title — which is why this page is what "Unduh PDF"
 * falls back to when the direct download fails.
 *
 * `auto` opens the dialog once the page has its fonts, for someone sent here
 * by that fallback, who has already pressed a button once. Fonts first:
 * printing before the webfont lands prints the fallback face.
 */
export function PrintButton({ auto = false }: { auto?: boolean }) {
  const printed = useRef(false)

  useEffect(() => {
    if (!auto || printed.current) return
    // A ref, not a cleanup flag: Strict Mode mounts twice, and a cancelled
    // first run plus a guarded second one would never print at all.
    printed.current = true
    void document.fonts.ready.then(() => window.print())
  }, [auto])

  return (
    <Button type="button" variant="outline" size="sm" onClick={() => window.print()}>
      <Printer aria-hidden />
      Cetak
    </Button>
  )
}

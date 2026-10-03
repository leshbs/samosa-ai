'use client'

import { useEffect, useRef } from 'react'
import { FileText } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * "Unduh PDF" on the print page. The browser's print dialog is the PDF
 * renderer now: "Simpan sebagai PDF" is in every desktop and mobile browser,
 * and the file it saves is named after the page title.
 *
 * `auto` opens the dialog once the page has its fonts, for someone who came
 * from the report's "Unduh PDF" and should not have to press it twice. Fonts
 * first: printing before the webfont lands prints the fallback face.
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
    <Button type="button" size="sm" onClick={() => window.print()}>
      <FileText aria-hidden />
      Unduh PDF
    </Button>
  )
}

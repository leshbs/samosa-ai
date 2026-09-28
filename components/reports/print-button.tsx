'use client'

import { Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * The print stylesheet in globals.css is what makes this worth offering: the
 * page drops the shell and keeps the document (§13). Without the button people
 * reach for the PDF export, which is a different artefact with a different
 * layout — fine, but not what someone wants when they only need the page they
 * are looking at.
 */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => window.print()}
      data-print="hide"
    >
      <Printer aria-hidden />
      Cetak
    </Button>
  )
}

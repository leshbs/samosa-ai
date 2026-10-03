'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { FileText, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ReportPdfPayload } from '@/modules/reporting'
import type { ApiSuccess } from '@/types/api'

async function reportData(jobId: string): Promise<ReportPdfPayload> {
  const response = await fetch(`/api/reports/${jobId}/document`)
  if (!response.ok) throw new Error(`document: HTTP ${response.status}`)
  const { data } = (await response.json()) as ApiSuccess<ReportPdfPayload>
  return data
}

/** Hands a finished file to the browser's download shelf. */
function save(file: Blob, fileName: string) {
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.append(link)
  link.click()
  link.remove()
  // Not revoked at once: Safari reads the blob after the click returns.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

/**
 * "Unduh PDF": one press, one file in the downloads folder (ADR-0014).
 *
 * The browser draws the PDF itself, so there is no server render to time out —
 * what failed in pilot 01. The drawing code is large and only this button
 * needs it, so it is fetched on the first press and by nobody who never
 * presses.
 *
 * If anything goes wrong — an old browser, a blocked script, a lost
 * connection — the reader is taken to the print page, which makes the same
 * report through the print dialog. They came for a PDF, and still get one.
 */
export function DownloadPdfButton({ jobId }: { jobId: string }) {
  const router = useRouter()
  const [working, setWorking] = useState(false)

  async function download() {
    setWorking(true)
    try {
      // The report's data and the code that draws it are fetched side by side:
      // neither needs the other, and waiting for one before asking for the
      // other was most of a first press.
      const [data, { renderReportPdf }] = await Promise.all([
        reportData(jobId),
        import('./pdf/report-pdf').then(async (drawing) => {
          await drawing.loadFaces()
          return drawing
        }),
      ])
      save(await renderReportPdf(data), data.fileName)
    } catch (cause) {
      console.error('report.pdf.download_failed', cause)
      router.push(`/reports/${jobId}/print?auto=1&from=download`)
    } finally {
      setWorking(false)
    }
  }

  return (
    <Button type="button" size="sm" onClick={download} disabled={working}>
      {working ? (
        <Loader2 aria-hidden className="animate-spin" />
      ) : (
        <FileText aria-hidden />
      )}
      {working ? 'Menyiapkan PDF…' : 'Unduh PDF'}
    </Button>
  )
}

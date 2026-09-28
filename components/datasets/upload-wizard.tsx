'use client'

import { Check, FileSpreadsheet, ShieldCheck, UploadCloud } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { AnimatePresence } from 'motion/react'
import * as m from 'motion/react-m'
import { toast } from 'sonner'
import { InlineError } from '@/components/layout/inline-error'
import { EASE } from '@/components/motion/motion-provider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { requestJson } from '@/modules/shared'
import type { DatasetPreview } from '@/modules/ingestion'
import type { DatasetSource } from '@/types/domain'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const ACCEPTED = {
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
}

const STEPS = ['Pilih file', 'Pilih kolom', 'Konfirmasi'] as const

/** Browsers disagree on the MIME type for CSV, so trust the extension. */
function sourceOf(file: File): DatasetSource {
  return file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'
}

function defaultName(file: File): string {
  return file.name.replace(/\.(csv|xlsx?|CSV|XLSX?)$/, '').slice(0, 120)
}

type CreatedDataset = {
  datasetId: string
  responseCount: number
  skippedEmpty: number
}

/**
 * Posts the dataset with a real progress figure.
 *
 * `fetch` cannot report request-body progress, and §10 asks for numeric progress
 * on anything that waits — a 10 MB file over school wifi is exactly that, and a
 * spinner that sits there for forty seconds is indistinguishable from a hang.
 * XMLHttpRequest is the only browser API that exposes upload progress, so this
 * one call uses it.
 *
 * It reads the same `{ data }` / `{ error: { message } }` envelope every route
 * handler returns, so failures surface identically to `requestJson`.
 */
function postDatasetWithProgress(
  body: FormData,
  onProgress: (percent: number) => void,
): Promise<{ ok: true; value: CreatedDataset } | { ok: false; message: string }> {
  return new Promise((resolve) => {
    const request = new XMLHttpRequest()
    request.open('POST', '/api/datasets')

    request.upload.addEventListener('progress', (event) => {
      if (event.lengthComputable) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    })

    request.addEventListener('load', () => {
      let payload: unknown
      try {
        payload = JSON.parse(request.responseText)
      } catch {
        resolve({
          ok: false,
          message: 'Server tidak merespons dengan benar. Coba lagi sebentar lagi.',
        })
        return
      }

      if (typeof payload === 'object' && payload !== null && 'data' in payload) {
        resolve({ ok: true, value: (payload as { data: CreatedDataset }).data })
        return
      }

      const message =
        typeof payload === 'object' &&
        payload !== null &&
        'error' in payload &&
        typeof (payload as { error?: { message?: unknown } }).error?.message === 'string'
          ? String((payload as { error: { message: string } }).error.message)
          : 'Unggahan gagal. Coba lagi.'

      resolve({ ok: false, message })
    })

    request.addEventListener('error', () =>
      resolve({
        ok: false,
        message: 'Koneksi ke server terputus. Periksa jaringanmu lalu coba lagi.',
      }),
    )

    request.send(body)
  })
}

type Step = 1 | 2 | 3

export function UploadWizard() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<DatasetPreview | null>(null)
  const [textColumn, setTextColumn] = useState('')
  /**
   * Starts empty and stays empty unless the uploader ticks something. A Google
   * Forms export puts names, classes and email addresses in the columns next to
   * the aspiration, and none of them are needed to analyse it — so the safe
   * state is the default state, not a checkbox someone has to remember to clear.
   */
  const [keepColumns, setKeepColumns] = useState<string[]>([])
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback(async (accepted: File[]) => {
    const picked = accepted[0]
    if (!picked) return

    setError(null)
    setBusy(true)

    const body = new FormData()
    body.append('file', picked)
    body.append('source', sourceOf(picked))

    const previewed = await requestJson<DatasetPreview>('/api/datasets/preview', {
      method: 'POST',
      body,
    })

    setBusy(false)

    if (!previewed.ok) {
      setError(previewed.error.message)
      return
    }

    setFile(picked)
    setPreview(previewed.value)
    setTextColumn(previewed.value.suggestedColumn ?? previewed.value.columns[0] ?? '')
    setKeepColumns([])
    setName(defaultName(picked))
    setStep(2)
  }, [])

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED,
    maxFiles: 1,
    maxSize: MAX_UPLOAD_BYTES,
    multiple: false,
  })

  /** Never includes the text column, even if it was ticked before being chosen. */
  const keptColumns = keepColumns.filter((column) => column !== textColumn)
  const otherColumns = preview
    ? preview.columns.filter((column) => column !== textColumn)
    : []

  async function submit() {
    if (!file || !textColumn) return

    setBusy(true)
    setProgress(0)
    setError(null)

    const body = new FormData()
    body.append('file', file)
    body.append('name', name.trim())
    body.append('source', sourceOf(file))
    body.append('textColumn', textColumn)
    // One entry per kept column; none appended means none stored.
    for (const column of keptColumns) {
      body.append('keepColumns', column)
    }

    const created = await postDatasetWithProgress(body, setProgress)

    setBusy(false)
    setProgress(null)

    if (!created.ok) {
      setError(created.message)
      return
    }

    toast.success(`${created.value.responseCount} aspirasi berhasil diunggah.`)
    router.replace(`/datasets/${created.value.datasetId}`)
    router.refresh()
  }

  function restart() {
    setStep(1)
    setFile(null)
    setPreview(null)
    setTextColumn('')
    setKeepColumns([])
    setError(null)
  }

  return (
    <div className="space-y-6">
      {/**
       * §5: the wizard goes backwards without losing anything. A completed step
       * is a button; the state for every step lives in this component, so
       * stepping back and forward again finds the column choice and the ticked
       * columns exactly as they were left.
       */}
      <ol className="flex flex-col gap-2 sm:flex-row">
        {STEPS.map((label, index) => {
          const number = (index + 1) as Step
          const current = step === number
          const done = step > number
          const reachable = done && preview !== null

          const content = (
            <>
              <span
                aria-hidden
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                  current && 'bg-primary text-primary-foreground',
                  done && 'bg-primary/15 text-primary',
                  !current && !done && 'bg-secondary text-muted-foreground',
                )}
              >
                {done ? <Check className="size-3" /> : number}
              </span>
              {label}
            </>
          )

          return (
            <li key={label} className="flex-1">
              {reachable ? (
                <button
                  type="button"
                  onClick={() => setStep(number)}
                  aria-current={current ? 'step' : undefined}
                  className="flex w-full items-center gap-2 rounded-control border px-3 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {content}
                </button>
              ) : (
                <div
                  aria-current={current ? 'step' : undefined}
                  className={cn(
                    'flex items-center gap-2 rounded-control border px-3 py-2 text-sm',
                    current ? 'border-primary font-medium' : 'text-muted-foreground',
                  )}
                >
                  {content}
                </div>
              )}
            </li>
          )
        })}
      </ol>

      {error ? (
        <InlineError
          what={error}
          why="File-nya mungkin tidak sesuai format, atau terlalu besar."
          recovery="Periksa bahwa file berformat CSV atau Excel di bawah 10 MB, lalu coba lagi."
        />
      ) : null}

      <AnimatePresence mode="wait" initial={false}>
        <m.div
          key={step}
          initial={{ opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -12 }}
          transition={{ duration: 0.2, ease: EASE }}
        >
          {step === 1 ? (
            <div
              {...getRootProps()}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-3 rounded-card border-2 border-dashed p-12 text-center transition-colors',
                isDragActive ? 'border-primary bg-secondary/40' : 'border-border',
              )}
            >
              <input {...getInputProps()} aria-label="Pilih file CSV atau Excel" />
              <UploadCloud className="size-8 text-muted-foreground" aria-hidden />
              <p className="font-medium">
                {busy ? 'Membaca file…' : 'Tarik file ke sini atau klik untuk memilih'}
              </p>
              <p className="text-sm text-muted-foreground">
                CSV atau Excel, maksimal 10 MB
              </p>
            </div>
          ) : null}

          {step === 2 && preview ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">
                  Kolom mana yang berisi aspirasi?
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {file?.name} · {preview.totalRows} baris
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid gap-2 sm:grid-cols-2">
                  {preview.columns.map((column) => (
                    <label
                      key={column}
                      className={cn(
                        'flex cursor-pointer items-start gap-3 rounded-control border p-3 text-sm transition-colors',
                        textColumn === column
                          ? 'border-primary bg-secondary/40'
                          : 'hover:bg-accent',
                      )}
                    >
                      <input
                        type="radio"
                        name="textColumn"
                        value={column}
                        checked={textColumn === column}
                        onChange={() => setTextColumn(column)}
                        className="mt-1 accent-[hsl(var(--primary))]"
                      />
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{column}</span>
                        <span className="block truncate text-muted-foreground">
                          {preview.sampleRows[0]?.[column] || '—'}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>

                {otherColumns.length > 0 ? (
                  <div className="space-y-3 rounded-card border border-dashed p-4">
                    <div className="flex items-start gap-3">
                      <ShieldCheck
                        aria-hidden
                        className="mt-0.5 size-4 shrink-0 text-primary"
                      />
                      <div className="space-y-1">
                        <p className="text-sm font-medium">Kolom lain tidak disimpan</p>
                        <p className="text-sm text-muted-foreground">
                          Kolom selain aspirasi dibuang sebelum disimpan. Analisis tidak
                          memerlukannya, dan kolom seperti nama atau email adalah data
                          pribadi yang tidak perlu ikut. Centang hanya kalau kamu
                          benar-benar membutuhkannya di laporan.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {otherColumns.map((column) => (
                        <label
                          key={column}
                          className={cn(
                            'flex cursor-pointer items-start gap-3 rounded-control border p-2 text-sm transition-colors',
                            keepColumns.includes(column)
                              ? 'border-notice/50 bg-notice-surface'
                              : 'hover:bg-accent',
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={keepColumns.includes(column)}
                            onChange={(event) =>
                              setKeepColumns((current) =>
                                event.target.checked
                                  ? [...current, column]
                                  : current.filter((kept) => kept !== column),
                              )
                            }
                            className="mt-1 accent-[hsl(var(--primary))]"
                          />
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{column}</span>
                            <span className="block truncate text-muted-foreground">
                              {preview.sampleRows[0]?.[column] || '—'}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>

                    <p aria-live="polite" className="text-sm">
                      {keptColumns.length === 0 ? (
                        <span className="text-muted-foreground">
                          Tidak ada kolom tambahan yang disimpan.
                        </span>
                      ) : (
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="text-muted-foreground">Akan disimpan:</span>
                          {keptColumns.map((column) => (
                            <Badge key={column} variant="notice">
                              {column}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </p>
                  </div>
                ) : null}

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {preview.columns.map((column) => (
                          <TableHead
                            key={column}
                            className={cn(
                              'whitespace-nowrap',
                              column === textColumn && 'text-primary',
                            )}
                          >
                            {column}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {preview.sampleRows.map((row, index) => (
                        <TableRow key={index}>
                          {preview.columns.map((column) => (
                            <TableCell
                              key={column}
                              className={cn(
                                'max-w-xs truncate',
                                column === textColumn && 'font-medium',
                              )}
                            >
                              {row[column]}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <div className="flex justify-between">
                  <Button type="button" variant="outline" onClick={restart}>
                    Ganti file
                  </Button>
                  <Button type="button" onClick={() => setStep(3)} disabled={!textColumn}>
                    Lanjut
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {step === 3 && preview && file ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Konfirmasi unggahan</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="dataset-name">Nama dataset</Label>
                  <Input
                    id="dataset-name"
                    value={name}
                    maxLength={120}
                    onChange={(event) => setName(event.target.value)}
                  />
                </div>

                <div className="flex items-start gap-3 rounded-card border p-3 text-sm">
                  <FileSpreadsheet
                    className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                    aria-hidden
                  />
                  <div className="space-y-1">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-muted-foreground">
                      {preview.totalRows} baris · kolom teks:{' '}
                      <strong className="text-foreground">{textColumn}</strong>
                    </p>
                    {/* Stated on the last screen before it is irreversible. */}
                    <p className="text-muted-foreground">
                      {keptColumns.length === 0
                        ? 'Kolom lain tidak disimpan.'
                        : `Kolom lain yang ikut disimpan: ${keptColumns.join(', ')}.`}
                    </p>
                  </div>
                </div>

                {progress !== null ? (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        {progress < 100 ? 'Mengunggah file…' : 'Memproses di server…'}
                      </span>
                      <span className="font-medium tabular-nums">{progress}%</span>
                    </div>
                    <Progress value={progress} aria-label="Progres unggahan" />
                    {progress === 100 ? (
                      <p className="text-xs text-muted-foreground">
                        File sudah terkirim. Server sedang memisahkan kolom dan menyimpan
                        aspirasinya — ini bagian yang tidak punya persentase.
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="flex justify-between">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStep(2)}
                    disabled={busy}
                  >
                    Kembali
                  </Button>
                  <Button
                    type="button"
                    onClick={submit}
                    disabled={busy || name.trim().length === 0}
                  >
                    {busy ? 'Mengunggah…' : 'Unggah'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </m.div>
      </AnimatePresence>
    </div>
  )
}

'use client'

import { FileSpreadsheet, UploadCloud } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useCallback, useState } from 'react'
import { useDropzone } from 'react-dropzone'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { DatasetPreview } from '@/modules/ingestion'
import type { DatasetSource } from '@/types/domain'

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

const ACCEPTED = {
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
}

/** Browsers disagree on the MIME type for CSV, so trust the extension. */
function sourceOf(file: File): DatasetSource {
  return file.name.toLowerCase().endsWith('.csv') ? 'csv' : 'xlsx'
}

function defaultName(file: File): string {
  return file.name.replace(/\.(csv|xlsx?|CSV|XLSX?)$/, '').slice(0, 120)
}

type Step = 1 | 2 | 3

export function UploadWizard() {
  const router = useRouter()
  const [step, setStep] = useState<Step>(1)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<DatasetPreview | null>(null)
  const [textColumn, setTextColumn] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onDrop = useCallback(async (accepted: File[]) => {
    const picked = accepted[0]
    if (!picked) return

    setError(null)
    setBusy(true)

    const body = new FormData()
    body.append('file', picked)
    body.append('source', sourceOf(picked))

    const response = await fetch('/api/datasets/preview', { method: 'POST', body })
    const payload = (await response.json()) as
      { data: DatasetPreview } | { error: { message: string } }

    setBusy(false)

    if (!response.ok || !('data' in payload)) {
      setError('error' in payload ? payload.error.message : 'File tidak bisa dibaca.')
      return
    }

    setFile(picked)
    setPreview(payload.data)
    setTextColumn(payload.data.suggestedColumn ?? payload.data.columns[0] ?? '')
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

  async function submit() {
    if (!file || !textColumn) return

    setBusy(true)
    setError(null)

    const body = new FormData()
    body.append('file', file)
    body.append('name', name.trim())
    body.append('source', sourceOf(file))
    body.append('textColumn', textColumn)

    const response = await fetch('/api/datasets', { method: 'POST', body })
    const payload = (await response.json()) as
      | { data: { datasetId: string; responseCount: number; skippedEmpty: number } }
      | { error: { message: string } }

    setBusy(false)

    if (!response.ok || !('data' in payload)) {
      setError('error' in payload ? payload.error.message : 'Upload gagal.')
      return
    }

    toast.success(`${payload.data.responseCount} aspirasi berhasil diunggah.`)
    router.replace(`/datasets/${payload.data.datasetId}`)
    router.refresh()
  }

  function restart() {
    setStep(1)
    setFile(null)
    setPreview(null)
    setTextColumn('')
    setError(null)
  }

  return (
    <div className="space-y-6">
      <ol className="flex gap-2 text-sm">
        {['Pilih file', 'Pilih kolom', 'Konfirmasi'].map((label, index) => (
          <li
            key={label}
            aria-current={step === index + 1 ? 'step' : undefined}
            className={cn(
              'flex-1 rounded-md border px-3 py-2',
              step === index + 1 ? 'border-primary font-medium' : 'text-muted-foreground',
            )}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {step === 1 ? (
        <div
          {...getRootProps()}
          className={cn(
            'flex cursor-pointer flex-col items-center gap-3 rounded-xl border-2 border-dashed p-12 text-center transition-colors',
            isDragActive ? 'border-primary bg-secondary/40' : 'border-border',
          )}
        >
          <input {...getInputProps()} aria-label="Pilih file CSV atau Excel" />
          <UploadCloud className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">
            {busy ? 'Membaca file…' : 'Tarik file ke sini atau klik untuk memilih'}
          </p>
          <p className="text-sm text-muted-foreground">CSV atau Excel, maksimal 10 MB</p>
        </div>
      ) : null}

      {step === 2 && preview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Kolom mana yang berisi aspirasi?</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              {file?.name} · {preview.totalRows} baris
            </p>

            <div className="grid gap-2 sm:grid-cols-2">
              {preview.columns.map((column) => (
                <label
                  key={column}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm',
                    textColumn === column ? 'border-primary bg-secondary/40' : '',
                  )}
                >
                  <input
                    type="radio"
                    name="textColumn"
                    value={column}
                    checked={textColumn === column}
                    onChange={() => setTextColumn(column)}
                    className="mt-1"
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

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {preview.columns.map((column) => (
                      <TableHead key={column} className="whitespace-nowrap">
                        {column}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {preview.sampleRows.map((row, index) => (
                    <TableRow key={index}>
                      {preview.columns.map((column) => (
                        <TableCell key={column} className="max-w-xs truncate">
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

            <div className="flex items-start gap-3 rounded-md border p-3 text-sm">
              <FileSpreadsheet
                className="mt-0.5 h-4 w-4 text-muted-foreground"
                aria-hidden
              />
              <div className="space-y-1">
                <p className="font-medium">{file.name}</p>
                <p className="text-muted-foreground">
                  {preview.totalRows} baris · kolom teks: <strong>{textColumn}</strong>
                </p>
              </div>
            </div>

            <div className="flex justify-between">
              <Button type="button" variant="outline" onClick={() => setStep(2)}>
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
    </div>
  )
}

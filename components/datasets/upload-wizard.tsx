'use client'

import { Check, FileSpreadsheet, ShieldCheck, Sparkles, UploadCloud } from 'lucide-react'
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
import {
  MODE_LABELS,
  MODE_OUTPUTS,
  QUESTION_MODES,
  isQuestionMode,
  type AnalysisMode,
  type DatasetSource,
} from '@/types/domain'

/**
 * Off until reports can break results down by a column (Phase C.6). Pilot 01:
 * the tester ticked a column and asked what it did — nothing in the report
 * used it, and a choice that changes nothing is worse than no choice. When it
 * is on, the mode list offers "Data responden" and those columns are stored
 * beside the answers; the API already accepts them as `keepColumns`.
 */
const OFFER_SEGMENTS = false

/** What a column can be set to: a question of one of four kinds, or left out. */
const SELECTABLE_MODES: readonly AnalysisMode[] = [
  ...QUESTION_MODES,
  ...(OFFER_SEGMENTS ? (['segment'] as const) : []),
  'ignore',
]

/**
 * What the wizard gets back from the preview: the sheet's headers, a few rows,
 * and a guess at what each column holds (ADR-0016).
 */
type Preview = Omit<DatasetPreview, 'profiles'> & {
  modes: Array<{ column: string; mode: AnalysisMode; source: 'model' | 'rule' }>
  modeDetection: { promptVersion: string | null; modelId: string | null }
}

/** A guess the wizard cannot offer is shown as the nearest thing it can. */
function selectable(mode: AnalysisMode): AnalysisMode {
  return SELECTABLE_MODES.includes(mode) ? mode : 'ignore'
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024

/**
 * Mirrors MAX_QUESTIONS_PER_DATASET in the ingestion module, which is where it
 * is enforced; this copy only stops the wizard offering what the server will
 * refuse.
 */
const MAX_QUESTIONS = 10

const ACCEPTED = {
  'text/csv': ['.csv'],
  'application/vnd.ms-excel': ['.xls'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
}

const STEPS = ['Pilih file', 'Periksa kolom', 'Konfirmasi'] as const

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
  respondentCount: number
  questionCount: number
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
  const [preview, setPreview] = useState<Preview | null>(null)
  /**
   * What each column is read as. Every column given a question mode becomes a
   * question of the dataset and a section of its report; a column set to
   * "Tidak dipakai" is not stored at all. It starts as the system's guess and
   * is the uploader's to overrule: a guess to correct, not a taxonomy to learn
   * (pilot 01, §4.2).
   *
   * The safe state is the default state: a Google Forms export puts names,
   * classes and email addresses beside the answers, and those are guessed as
   * "Tidak dipakai" rather than left for someone to remember to switch off.
   */
  const [modes, setModes] = useState<Record<string, AnalysisMode>>({})
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

    const previewed = await requestJson<Preview>('/api/datasets/preview', {
      method: 'POST',
      body,
    })

    setBusy(false)

    if (!previewed.ok) {
      setError(previewed.error.message)
      return
    }

    const guessed = new Map(
      previewed.value.modes.map((guess) => [guess.column, selectable(guess.mode)]),
    )
    const initial: Record<string, AnalysisMode> = {}
    let questionCount = 0
    for (const column of previewed.value.columns) {
      const mode = guessed.get(column) ?? 'ignore'
      // Past the limit a guessed question is left out rather than refused later.
      const fits = !isQuestionMode(mode) || questionCount < MAX_QUESTIONS
      initial[column] = fits ? mode : 'ignore'
      if (fits && isQuestionMode(mode)) questionCount += 1
    }
    // A sheet where nothing was guessed to be a question still needs one to
    // start from, or the step opens on a disabled "Lanjut" with no hint why.
    const fallback = previewed.value.suggestedColumn ?? previewed.value.columns[0]
    if (questionCount === 0 && fallback) initial[fallback] = 'evaluative'

    setFile(picked)
    setPreview(previewed.value)
    setModes(initial)
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

  const modeOf = (column: string): AnalysisMode => modes[column] ?? 'ignore'
  const guessOf = (column: string) =>
    preview?.modes.find((guess) => guess.column === column) ?? null
  // Sheet order: it is the order the questions appear in the report.
  const questions = preview
    ? preview.columns.filter((column) => isQuestionMode(modeOf(column)))
    : []
  const keptColumns = preview
    ? preview.columns.filter((column) => modeOf(column) === 'segment')
    : []
  const unusedCount = preview
    ? preview.columns.length - questions.length - keptColumns.length
    : 0
  const atLimit = questions.length >= MAX_QUESTIONS

  async function submit() {
    if (!file || questions.length === 0) return

    setBusy(true)
    setProgress(0)
    setError(null)

    const body = new FormData()
    body.append('file', file)
    body.append('name', name.trim())
    body.append('source', sourceOf(file))
    // Every column with what it was set to and what was guessed for it. The
    // guess is sent back as it was received: it is kept so the guesses can be
    // scored later, never to decide anything.
    body.append(
      'columnModes',
      JSON.stringify(
        (preview?.columns ?? []).map((column) => ({
          column,
          mode: modeOf(column),
          detectedMode: guessOf(column)?.mode ?? null,
        })),
      ),
    )
    if (preview) body.append('modeDetection', JSON.stringify(preview.modeDetection))
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

    toast.success(
      created.value.questionCount > 1
        ? `${created.value.responseCount} jawaban dari ${created.value.respondentCount} responden berhasil diunggah.`
        : `${created.value.responseCount} aspirasi berhasil diunggah.`,
    )
    router.replace(`/datasets/${created.value.datasetId}`)
    router.refresh()
  }

  function restart() {
    setStep(1)
    setFile(null)
    setPreview(null)
    setModes({})
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
                {busy
                  ? 'Membaca file dan menebak jenis tiap kolom…'
                  : 'Tarik file ke sini atau klik untuk memilih'}
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
                  Kolom mana yang dianalisis, dan sebagai apa?
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  {file?.name} · {preview.totalRows} baris
                </p>
                <p className="text-sm text-muted-foreground">
                  SAMOSA sudah menebak jenis tiap kolom dari judul dan bentuk isinya.
                  Periksa tebakannya dan ubah yang keliru. Tiap kolom yang dianalisis
                  menjadi satu pertanyaan di laporan, dengan judul kolomnya sebagai judul
                  bagian.
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                <ul className="space-y-2">
                  {preview.columns.map((column, index) => {
                    const mode = modeOf(column)
                    const guess = guessOf(column)
                    const used = isQuestionMode(mode)
                    const guessed = guess ? selectable(guess.mode) : null
                    const selectId = `column-mode-${index}`

                    return (
                      <li
                        key={column}
                        className={cn(
                          'grid gap-x-4 gap-y-2 rounded-control border p-3 text-sm sm:grid-cols-[minmax(0,1fr)_14rem]',
                          used ? 'border-primary bg-secondary/40' : 'bg-card',
                        )}
                      >
                        <div className="min-w-0">
                          <label
                            htmlFor={selectId}
                            className="block truncate font-medium"
                          >
                            {column}
                          </label>
                          <p className="truncate text-muted-foreground">
                            {preview.sampleRows[0]?.[column] || '—'}
                          </p>
                        </div>
                        <div className="space-y-1">
                          <select
                            id={selectId}
                            value={mode}
                            onChange={(event) =>
                              setModes((current) => ({
                                ...current,
                                [column]: event.target.value as AnalysisMode,
                              }))
                            }
                            className="h-9 w-full rounded-control border bg-background px-2 text-sm text-foreground"
                          >
                            {SELECTABLE_MODES.map((option) => (
                              <option
                                key={option}
                                value={option}
                                // Past the limit a column can still be switched
                                // between kinds, but not newly added.
                                disabled={!used && atLimit && isQuestionMode(option)}
                              >
                                {MODE_LABELS[option]}
                              </option>
                            ))}
                          </select>
                          <p className="text-xs text-muted-foreground">
                            {isQuestionMode(mode)
                              ? `Laporan: ${MODE_OUTPUTS[mode]}.`
                              : mode === 'segment'
                                ? 'Disimpan bersama jawabannya.'
                                : 'Tidak disimpan.'}
                          </p>
                          {guessed === null ? null : guessed === mode ? (
                            <Badge variant="muted" className="gap-1">
                              <Sparkles aria-hidden className="size-3" />
                              Tebakan
                            </Badge>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                setModes((current) => ({ ...current, [column]: guessed }))
                              }
                              disabled={!used && atLimit && isQuestionMode(guessed)}
                              className="text-xs text-primary underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:text-muted-foreground disabled:no-underline"
                            >
                              Kembali ke tebakan: {MODE_LABELS[guessed]}
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>

                <p aria-live="polite" className="text-sm text-muted-foreground">
                  {questions.length === 0
                    ? 'Belum ada kolom yang dianalisis. Ubah jenis paling tidak satu kolom.'
                    : questions.length === 1
                      ? '1 pertanyaan dianalisis.'
                      : `${questions.length} pertanyaan dianalisis; laporannya punya satu bagian untuk masing-masing.`}
                  {atLimit
                    ? ` Paling banyak ${MAX_QUESTIONS} pertanyaan per dataset.`
                    : ''}
                </p>

                <div className="flex items-start gap-3 rounded-card border border-dashed p-4">
                  <ShieldCheck
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-medium">
                      Kolom yang tidak dipakai tidak disimpan
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Kolom seperti nama atau email dibuang sebelum disimpan; analisis
                      tidak memerlukannya. Untuk menebak jenis kolom, hanya judul kolom
                      dan bentuk isinya yang dikirim ke AI: berapa yang terisi dan
                      seberapa panjang, bukan isi selnya.
                    </p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {preview.columns.map((column) => (
                          <TableHead
                            key={column}
                            className={cn(
                              'whitespace-nowrap',
                              questions.includes(column) && 'text-primary',
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
                                questions.includes(column) && 'font-medium',
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
                  <Button
                    type="button"
                    onClick={() => setStep(3)}
                    disabled={questions.length === 0}
                  >
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
                      {preview.totalRows} baris ·{' '}
                      {questions.length === 1
                        ? '1 pertanyaan dianalisis'
                        : `${questions.length} pertanyaan dianalisis`}
                    </p>
                    <ul className="space-y-0.5">
                      {questions.map((column) => (
                        <li
                          key={column}
                          className="flex flex-wrap items-baseline gap-x-2"
                        >
                          <strong className="font-medium text-foreground">
                            {column}
                          </strong>
                          <span className="text-muted-foreground">
                            {MODE_LABELS[modeOf(column)]}
                          </span>
                        </li>
                      ))}
                    </ul>
                    {/* Stated on the last screen before it is irreversible. */}
                    <p className="text-muted-foreground">
                      {keptColumns.length > 0
                        ? `Ikut disimpan sebagai data responden: ${keptColumns.join(', ')}. `
                        : ''}
                      {unusedCount === 0
                        ? 'Tidak ada kolom lain di file ini.'
                        : `${unusedCount} kolom lain tidak disimpan.`}
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
                        jawabannya — ini bagian yang tidak punya persentase.
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

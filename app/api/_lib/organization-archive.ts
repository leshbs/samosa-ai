import { listJobs } from '@/modules/analysis'
import { listMembers, type SessionUser } from '@/modules/auth'
import { listAllResponses, listDatasets } from '@/modules/ingestion'
import {
  archiveSlug,
  buildArchive,
  exportDatasetToCsv,
  exportReportToPdf,
  exportResponsesToCsv,
  type ArchiveEntry,
} from '@/modules/reporting'
import { ERROR_CODES, appError, err, ok, type Result } from '@/modules/shared'
import type { AppError } from '@/modules/shared'
import { formatDateTime } from '@/lib/utils'
import { ROLE_LABELS, isReportable } from '@/types/domain'
import { loadExportContext, loadReportExport } from './report-data'

/** Every job the organization has; the list page stops at 50, this must not. */
const ALL_JOBS = 1_000

export type OrganizationArchive = {
  bytes: Uint8Array
  fileName: string
  /** Reports that could not be rendered; the README names them too. */
  skipped: number
}

function shortId(id: string): string {
  return id.slice(0, 8)
}

/**
 * Checklist 5.7: the portability promise in docs/OVERVIEW.md ("semua data user
 * harus bisa di-export"), made executable. Everything is read under RLS as the
 * requesting user, through the same functions the pages use, so the archive
 * cannot hold anything its requester could not already open — and everything
 * is filtered to the active workspace, so it holds one organization's data
 * even when its requester belongs to two.
 *
 * Reports are rendered one after another rather than all at once: a PDF holds
 * its whole document in memory while it renders, and twenty in parallel is how
 * a serverless function runs out of it.
 */
export async function buildOrganizationArchive(
  session: SessionUser,
): Promise<Result<OrganizationArchive, AppError>> {
  const [datasets, jobs, members, context] = await Promise.all([
    // Archived datasets and their reports are hidden from the app but still
    // the organization's data: the archive is how they are got out.
    listDatasets(session.organizationId, { archived: 'include' }),
    listJobs(session.organizationId, { limit: ALL_JOBS, includeArchived: true }),
    listMembers(session.organizationId),
    loadExportContext(session),
  ])
  if (!datasets.ok) return datasets
  if (!jobs.ok) return jobs

  const timezone = session.organizationTimezone
  const entries: ArchiveEntry[] = []
  const datasetFiles = new Map<string, string>()

  for (const dataset of datasets.value) {
    const responses = await listAllResponses(session.organizationId, dataset.id)
    if (!responses.ok) {
      return err(
        appError(ERROR_CODES.INTERNAL, `Dataset "${dataset.name}" tidak bisa dibaca`),
      )
    }
    const path = `datasets/${archiveSlug(dataset.name, 'dataset')}-${shortId(dataset.id)}.csv`
    datasetFiles.set(dataset.id, path)
    entries.push({ path, content: exportDatasetToCsv(responses.value) })
  }

  const reportFiles = new Map<string, { pdf: string; csv: string }>()
  const skipped: string[] = []

  for (const job of jobs.value.filter((candidate) => isReportable(candidate.status))) {
    const stem = `reports/${archiveSlug(job.datasetName, 'laporan')}-${shortId(job.id)}`
    const bundle = await loadReportExport(job.id, context, { includeArchived: true })
    const pdf = bundle.ok ? await exportReportToPdf(bundle.value.document) : bundle

    if (!bundle.ok || !pdf.ok) {
      skipped.push(`${job.datasetName} (${formatDateTime(job.createdAt, timezone)})`)
      continue
    }

    entries.push({ path: `${stem}.pdf`, content: pdf.value.bytes })
    entries.push({
      path: `${stem}.csv`,
      content: exportResponsesToCsv(bundle.value.rows),
    })
    reportFiles.set(job.id, { pdf: `${stem}.pdf`, csv: `${stem}.csv` })
  }

  const exportedAt = new Date()
  const metadata = {
    format: 'samosa-archive/1',
    exportedAt: exportedAt.toISOString(),
    exportedBy: session.email,
    organization: {
      id: session.organizationId,
      name: session.organizationName,
      timezone,
    },
    members: members.ok
      ? members.value.map((member) => ({
          email: member.email,
          displayName: member.displayName,
          title: member.title,
          role: member.role,
          joinedAt: member.joinedAt,
        }))
      : [],
    datasets: datasets.value.map((dataset) => ({
      id: dataset.id,
      name: dataset.name,
      source: dataset.source,
      responseCount: dataset.responseCount,
      textColumn: dataset.textColumnName,
      keptColumns: dataset.keptColumns,
      createdAt: dataset.createdAt,
      archivedAt: dataset.archivedAt,
      file: datasetFiles.get(dataset.id) ?? null,
    })),
    analyses: jobs.value.map((job) => ({
      id: job.id,
      datasetId: job.datasetId,
      datasetName: job.datasetName,
      status: job.status,
      promptVersion: job.promptVersion,
      modelId: job.modelId || null,
      processedCount: job.processedCount,
      totalCount: job.totalCount,
      failedCount: job.failedCount,
      inputTokens: job.inputTokens,
      outputTokens: job.outputTokens,
      costMicroIdr: job.costMicroIdr,
      createdBy: job.createdBy,
      createdAt: job.createdAt,
      finishedAt: job.finishedAt,
      files: reportFiles.get(job.id) ?? null,
    })),
  }

  entries.push({ path: 'metadata.json', content: JSON.stringify(metadata, null, 2) })
  entries.push({
    path: 'BACA-SAYA.txt',
    content: readme({
      organizationName: session.organizationName,
      exportedAt: formatDateTime(exportedAt, timezone),
      datasets: datasets.value.length,
      reports: reportFiles.size,
      members: members.ok ? members.value.length : null,
      skipped,
    }),
  })

  const date = exportedAt.toISOString().slice(0, 10)
  return ok({
    bytes: buildArchive(entries),
    fileName: `samosa-${archiveSlug(session.organizationName, 'organisasi')}-${date}.zip`,
    skipped: skipped.length,
  })
}

function readme(input: {
  organizationName: string
  exportedAt: string
  datasets: number
  reports: number
  members: number | null
  skipped: string[]
}): string {
  const lines = [
    `Arsip SAMOSA — ${input.organizationName}`,
    `Diekspor ${input.exportedAt}`,
    '',
    'Isi arsip:',
    `  datasets/     ${input.datasets} dataset, satu CSV per dataset: teks aspirasi`,
    '                beserta kolom yang dipilih untuk disimpan saat unggah.',
    `  reports/      ${input.reports} laporan, masing-masing PDF (siap cetak) dan CSV`,
    '                (satu baris per aspirasi dengan sentimen, topik, kata kunci).',
    '  metadata.json organisasi, anggota, dataset, dan setiap analisis — termasuk',
    '                versi prompt dan model, supaya hasilnya bisa ditelusuri ulang.',
    '',
    'Semua CSV memakai UTF-8 dengan BOM, jadi Excel membukanya dengan benar.',
    'File unggahan asli (CSV/Excel mentah) tidak ikut: yang disimpan SAMOSA',
    'adalah hasil pemetaannya, dan itulah yang ada di datasets/.',
  ]

  if (input.members !== null) {
    lines.push('', `Anggota: ${input.members} orang, dengan peran masing-masing:`)
    lines.push(
      ...Object.entries(ROLE_LABELS).map(([role, label]) => `  ${role} = ${label}`),
    )
  }

  if (input.skipped.length > 0) {
    lines.push(
      '',
      `${input.skipped.length} laporan tidak bisa dibuat saat ekspor dan tidak ikut:`,
      ...input.skipped.map((name) => `  - ${name}`),
      'Hasil analisisnya tetap ada di SAMOSA; unduh dari halaman laporannya.',
    )
  }

  return lines.join('\n') + '\n'
}

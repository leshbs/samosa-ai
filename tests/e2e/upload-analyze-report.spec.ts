import { expect, test } from '@playwright/test'

/**
 * The happy path, end to end: sign in -> upload -> analyze -> report -> export.
 *
 * It needs a real account and spends real money on the model, so it runs only
 * when the credentials are supplied:
 *
 *   E2E_EMAIL=... E2E_PASSWORD=... pnpm test:e2e
 *
 * Eight responses keeps a run to a fraction of a rupiah. The dataset it uploads
 * is left behind on purpose — a failed run is far easier to diagnose with the
 * rows still there.
 */
const EMAIL = process.env.E2E_EMAIL
const PASSWORD = process.env.E2E_PASSWORD

const CSV = `Nama,Aspirasi
Ani,Kantin sekolah perlu tambah pilihan makanan sehat dan harganya terjangkau
Budi,Jadwal pelajaran sering berubah mendadak bikin bingung
Citra,Terima kasih kepada OSIS acara Pensi kemarin sangat seru dan rapi
Dedi,Toilet lantai dua sering tidak ada air mohon diperbaiki
Eka,Perpustakaan butuh koleksi buku baru terutama novel
Fajar,Lapangan basket ringnya rusak sudah lama belum diperbaiki
Gita,Kegiatan ekstrakurikuler robotik tolong ditambah jamnya
Hadi,Guru matematika menjelaskan dengan sangat jelas dan sabar
`

test.describe('upload to report', () => {
  test('landing page invites the user to start an analysis', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'SAMOSA' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mulai analisis' })).toBeVisible()
  })

  test('uploads a CSV, runs analysis, and exports the report', async ({ page }) => {
    test.skip(!EMAIL || !PASSWORD, 'Set E2E_EMAIL and E2E_PASSWORD to run this.')
    // An LLM call per batch plus one for the summary; minutes, not seconds.
    test.setTimeout(5 * 60 * 1000)

    await page.goto('/login')
    // The form submits through client JS, so a submit that beats hydration is
    // silently dropped -- wait for the field to be interactive, not just present.
    await expect(page.locator('input[type="email"]')).toBeEnabled()
    await page.fill('input[type="email"]', EMAIL!)
    await page.fill('input[type="password"]', PASSWORD!)
    await page.click('button[type="submit"]')
    await page.waitForURL((url) => !url.pathname.startsWith('/login'))

    await page.goto('/datasets/new')
    await page.setInputFiles('input[type="file"]', {
      name: 'aspirasi-e2e.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV),
    })

    await page.locator('input[type="radio"][value="Aspirasi"]').check()
    await page.getByRole('button', { name: 'Lanjut' }).click()
    await page.getByRole('button', { name: /Unggah/ }).click()
    await page.waitForURL(/\/datasets\/[0-9a-f-]{36}/)

    // Scoped to main: the sidebar has an "Analisis" link with the same name.
    await page.locator('main button:has-text("Analisis")').first().click()
    await page.getByRole('button', { name: 'Jalankan' }).click()
    await page.waitForURL(/\/analysis\/[0-9a-f-]{36}/)

    const jobId = new URL(page.url()).pathname.split('/').pop()
    expect(jobId).toBeTruthy()

    await expect(page.getByText(/Selesai|Sebagian/)).toBeVisible({ timeout: 4 * 60_000 })

    await page.goto(`/reports/${jobId}`)
    // The summary is written before the job goes terminal, so by the time the
    // status says "Selesai" it is already on the page.
    const summary = page.locator('text=Ringkasan eksekutif')
    await expect(summary).toBeVisible()
    await expect(page.locator('svg.recharts-surface').first()).toBeVisible()

    const pdf = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Export PDF' }).click()
    expect((await pdf).suggestedFilename()).toMatch(/\.pdf$/)

    const csv = page.waitForEvent('download')
    await page.getByRole('link', { name: 'Export CSV' }).click()
    expect((await csv).suggestedFilename()).toMatch(/\.csv$/)
  })
})

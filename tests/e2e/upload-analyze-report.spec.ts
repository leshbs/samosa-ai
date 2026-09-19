import { expect, test } from '@playwright/test'

/**
 * Critical flow: upload -> analyze -> view report.
 * Skipped until auth fixtures and a seeded test org exist.
 */
test.describe('upload to report', () => {
  test('landing page invites the user to start an analysis', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'SAMOSA' })).toBeVisible()
    await expect(page.getByRole('link', { name: 'Mulai analisis' })).toBeVisible()
  })

  test.skip('uploads a CSV, runs analysis, and renders the report', async () => {
    // TODO: implement once Supabase auth fixtures land.
  })
})

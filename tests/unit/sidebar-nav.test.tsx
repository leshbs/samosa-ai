import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

let pathname = '/dashboard'

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}))

const { SidebarNav } = await import('@/components/layout/sidebar-nav')

const COUNTS = { datasets: 7, reports: 4 }

function current(): string | null {
  return (
    screen
      .getAllByRole('link')
      .find((link) => link.getAttribute('aria-current') === 'page')
      ?.textContent?.replace(/\d+.*$/, '')
      .trim() ?? null
  )
}

beforeEach(() => {
  pathname = '/dashboard'
})

describe('SidebarNav', () => {
  it('lights the most specific entry for nested routes', () => {
    pathname = '/datasets/new'
    const { unmount } = render(<SidebarNav counts={COUNTS} canCreate />)
    // /datasets is a prefix of /datasets/new; the longer match must win.
    expect(current()).toBe('Analisis Baru')
    unmount()

    pathname = '/datasets/1b2c'
    render(<SidebarNav counts={COUNTS} canCreate />)
    expect(current()).toBe('Dataset')
  })

  it('hides — not disables — the create entry for roles that cannot create', () => {
    render(<SidebarNav counts={COUNTS} canCreate={false} />)

    expect(screen.queryByRole('link', { name: /Analisis Baru/ })).toBeNull()
    expect(screen.getAllByRole('link')).toHaveLength(4)
  })

  it('marks nothing current on a route outside the navigation', () => {
    pathname = '/analysis/9f8e'
    render(<SidebarNav counts={COUNTS} canCreate />)

    expect(current()).toBeNull()
  })

  it('shows counts, and hides a badge whose count failed to load', () => {
    render(<SidebarNav counts={{ datasets: null, reports: 4 }} canCreate />)

    expect(screen.getByRole('link', { name: /Laporan/ }).textContent).toContain('4')
    expect(screen.getByRole('link', { name: /Dataset/ }).textContent).toBe('Dataset')
  })
})

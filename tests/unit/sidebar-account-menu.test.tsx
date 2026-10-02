import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const replace = vi.fn()
const refresh = vi.fn()
const signOut = vi.fn()
const requestJson = vi.fn()
const setTheme = vi.fn()
let resolvedTheme = 'light'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }))
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme, setTheme }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut } }),
}))

vi.mock('@/modules/shared', () => ({ requestJson }))

const { SidebarAccountMenu } = await import('@/components/layout/sidebar-account-menu')

const OWN = { organizationId: 'org-1', name: 'OSIS Nusantara' }
const JOINED = { organizationId: 'org-2', name: 'MPK Nusantara' }

function renderMenu(workspaces = [OWN]) {
  render(
    <SidebarAccountMenu
      email="ketua@osis.test"
      displayName="Rani Putri"
      organizationName="OSIS Nusantara"
      organizationId="org-1"
      workspaces={workspaces}
    />,
  )
  return screen.getByRole('button', { name: /OSIS Nusantara/ })
}

/** Radix opens on pointerdown, which jsdom cannot fake faithfully; Enter is the same path. */
function open(trigger: HTMLElement) {
  fireEvent.keyDown(trigger, { key: 'Enter' })
}

beforeEach(() => {
  replace.mockReset()
  refresh.mockReset()
  signOut.mockReset().mockResolvedValue({ error: null })
  setTheme.mockReset()
  requestJson.mockReset().mockResolvedValue({ ok: true, value: {} })
  resolvedTheme = 'light'
})

describe('SidebarAccountMenu', () => {
  it('keeps the account out of sight until the organization is clicked', () => {
    const trigger = renderMenu()

    expect(screen.queryByText('Rani Putri')).toBeNull()
    expect(screen.queryByRole('menuitem', { name: 'Keluar' })).toBeNull()

    open(trigger)

    expect(screen.getByText('Rani Putri')).toBeTruthy()
    expect(screen.getByText('ketua@osis.test')).toBeTruthy()
    const profile = screen.getByRole('menuitem', { name: /^Profil$/ })
    // Organization settings live in the sidebar; the account menu is about you.
    expect(profile.getAttribute('href')).toBe('/profile')
    expect(screen.getByRole('menuitemcheckbox', { name: /Tema gelap/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Keluar' })).toBeTruthy()
  })

  it('offers no switcher to someone with one workspace', () => {
    open(renderMenu())

    expect(screen.queryByRole('group', { name: 'Ruang kerja' })).toBeNull()
    expect(screen.getAllByRole('menuitem')).toHaveLength(2)
  })

  it('switches workspace and goes to the dashboard of the new one', async () => {
    open(renderMenu([OWN, JOINED]))

    expect(
      screen
        .getByRole('menuitem', { name: 'OSIS Nusantara' })
        .getAttribute('aria-current'),
    ).toBe('true')
    fireEvent.click(screen.getByRole('menuitem', { name: 'MPK Nusantara' }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
    expect(requestJson).toHaveBeenCalledWith(
      '/api/workspace/active',
      expect.objectContaining({ body: JSON.stringify({ organizationId: 'org-2' }) }),
    )
    expect(refresh).toHaveBeenCalled()
  })

  it('does nothing when the open workspace is picked again', () => {
    open(renderMenu([OWN, JOINED]))
    fireEvent.click(screen.getByRole('menuitem', { name: 'OSIS Nusantara' }))

    expect(requestJson).not.toHaveBeenCalled()
  })

  it('flips the theme and stays open to show the result', () => {
    open(renderMenu())

    const theme = screen.getByRole('menuitemcheckbox', { name: /Tema gelap/ })
    expect(theme.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(theme)

    expect(setTheme).toHaveBeenCalledWith('dark')
    expect(screen.getByRole('menu')).toBeTruthy()
  })

  it('sends the user to the landing page after signing out', async () => {
    open(renderMenu())
    fireEvent.click(screen.getByRole('menuitem', { name: 'Keluar' }))

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/'))
    expect(signOut).toHaveBeenCalled()
    expect(refresh).toHaveBeenCalled()
  })
})

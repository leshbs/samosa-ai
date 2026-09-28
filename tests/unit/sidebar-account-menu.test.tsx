import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const replace = vi.fn()
const refresh = vi.fn()
const signOut = vi.fn()
const setTheme = vi.fn()
let resolvedTheme = 'light'

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh }) }))
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme, setTheme }) }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signOut } }),
}))

const { SidebarAccountMenu } = await import('@/components/layout/sidebar-account-menu')

function renderMenu() {
  render(
    <SidebarAccountMenu
      email="ketua@osis.test"
      displayName="Rani Putri"
      organizationName="OSIS Nusantara"
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
    expect(screen.getByRole('menuitem', { name: /Profil & pengaturan/ })).toBeTruthy()
    expect(screen.getByRole('menuitemcheckbox', { name: /Tema gelap/ })).toBeTruthy()
    expect(screen.getByRole('menuitem', { name: 'Keluar' })).toBeTruthy()
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

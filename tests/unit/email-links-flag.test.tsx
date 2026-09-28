import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const replace = vi.fn()
const signUp = vi.fn()
const signInWithPassword = vi.fn()
const env = {
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
  NEXT_PUBLIC_EMAIL_LINKS_ENABLED: false,
}

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }))
vi.mock('@/lib/env', () => ({ clientEnv: env }))
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({ auth: { signUp, signInWithPassword } }),
}))
vi.mock('@/modules/shared', () => ({
  requestJson: vi.fn(async () => ({ ok: true, value: {} })),
}))

const { LoginForm } = await import('@/components/forms/login-form')
const { SignupForm } = await import('@/components/forms/signup-form')

function fillSignup() {
  const type = (id: string, value: string) =>
    fireEvent.change(document.getElementById(id)!, { target: { value } })
  type('fullName', 'Rani Putri')
  type('organizationName', 'OSIS Nusantara')
  type('email', 'rani@osis.test')
  type('password', 'Password-Contoh-1')
  fireEvent.click(screen.getByRole('button', { name: 'Buat akun' }))
}

beforeEach(() => {
  replace.mockReset()
  signUp.mockReset()
  signInWithPassword.mockReset()
  env.NEXT_PUBLIC_EMAIL_LINKS_ENABLED = false
})

describe('with email links off', () => {
  it('does not offer a password reset that could never arrive', () => {
    render(<LoginForm redirectTo="/dashboard" />)

    expect(screen.queryByRole('link', { name: 'Lupa password?' })).toBeNull()
  })

  it('goes straight to the dashboard when signup returns a session', async () => {
    signUp.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null })
    render(<SignupForm />)

    fillSignup()

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
  })

  it('says the switches disagree instead of waiting on an email', async () => {
    signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null })
    render(<SignupForm />)

    fillSignup()

    await screen.findByText(/server masih meminta verifikasi email/)
    expect(replace).not.toHaveBeenCalledWith('/verify-email')
  })
})

describe('with email links on', () => {
  it('offers the password reset', () => {
    env.NEXT_PUBLIC_EMAIL_LINKS_ENABLED = true
    render(<LoginForm redirectTo="/dashboard" />)

    expect(screen.getByRole('link', { name: 'Lupa password?' })).toBeTruthy()
  })

  it('sends a signup without a session to check the inbox', async () => {
    env.NEXT_PUBLIC_EMAIL_LINKS_ENABLED = true
    signUp.mockResolvedValue({ data: { session: null, user: {} }, error: null })
    render(<SignupForm />)

    fillSignup()

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/verify-email'))
  })
})

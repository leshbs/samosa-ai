import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const replace = vi.fn()
const requestJson = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }))
vi.mock('@/modules/shared', () => ({ requestJson }))

const { CreateOrganizationForm } =
  await import('@/components/forms/create-organization-form')

function submit(name: string) {
  fireEvent.change(screen.getByLabelText('Nama organisasi baru'), {
    target: { value: name },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Buat organisasi' }))
}

beforeEach(() => {
  replace.mockReset()
  requestJson.mockReset()
})

describe('CreateOrganizationForm', () => {
  it('provisions under the typed name and opens the dashboard', async () => {
    requestJson.mockResolvedValue({ ok: true, value: { organizationId: 'org-1' } })
    render(<CreateOrganizationForm />)

    submit('OSIS Baru')

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
    expect(requestJson).toHaveBeenCalledWith(
      '/api/auth/provision',
      expect.objectContaining({
        body: JSON.stringify({ organizationName: 'OSIS Baru' }),
      }),
    )
  })

  it('stays put and says why when provisioning fails', async () => {
    requestJson.mockResolvedValue({
      ok: false,
      error: { code: 'INTERNAL', message: 'Gagal membuat organisasi' },
    })
    render(<CreateOrganizationForm />)

    submit('OSIS Baru')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Gagal membuat organisasi',
    )
    expect(replace).not.toHaveBeenCalled()
  })

  it('cannot be submitted without a name', () => {
    render(<CreateOrganizationForm />)
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Buat organisasi' }).disabled,
    ).toBe(true)
  })
})

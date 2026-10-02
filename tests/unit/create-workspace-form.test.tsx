import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

const replace = vi.fn()
const requestJson = vi.fn()

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, refresh: vi.fn() }) }))
vi.mock('@/modules/shared', () => ({ requestJson }))

const { CreateWorkspaceForm } = await import('@/components/forms/create-workspace-form')

function submit(name: string) {
  fireEvent.change(screen.getByLabelText('Nama ruang kerja baru'), {
    target: { value: name },
  })
  fireEvent.click(screen.getByRole('button', { name: 'Buat ruang kerja' }))
}

beforeEach(() => {
  replace.mockReset()
  requestJson.mockReset()
})

describe('CreateWorkspaceForm', () => {
  it('creates under the typed name and opens the dashboard', async () => {
    requestJson.mockResolvedValue({ ok: true, value: { organizationId: 'org-1' } })
    render(<CreateWorkspaceForm />)

    submit('OSIS Baru')

    await waitFor(() => expect(replace).toHaveBeenCalledWith('/dashboard'))
    expect(requestJson).toHaveBeenCalledWith(
      '/api/workspace',
      expect.objectContaining({
        body: JSON.stringify({ name: 'OSIS Baru' }),
      }),
    )
  })

  it('stays put and says why when the plan has no room', async () => {
    requestJson.mockResolvedValue({
      ok: false,
      error: { code: 'CONFLICT', message: 'Kamu sudah punya ruang kerja sendiri.' },
    })
    render(<CreateWorkspaceForm />)

    submit('OSIS Baru')

    expect((await screen.findByRole('alert')).textContent).toBe(
      'Kamu sudah punya ruang kerja sendiri.',
    )
    expect(replace).not.toHaveBeenCalled()
  })

  it('cannot be submitted without a name', () => {
    render(<CreateWorkspaceForm />)
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Buat ruang kerja' })
        .disabled,
    ).toBe(true)
  })
})

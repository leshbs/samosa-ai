'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { requestJson } from '@/modules/shared'

export type TransferCandidate = {
  userId: string
  name: string
  email: string
  roleLabel: string
}

type EmailOutcome = 'sent' | 'off' | 'failed'

function normalize(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID')
}

/**
 * Checklist 5.2, in two steps: choose who, then type the organization's name.
 * The second step restates the consequence in full, because it is the one
 * action in the app that the person doing it cannot undo on their own.
 *
 * Kept deliberately unglamorous. A graduating chair will do this once, in a
 * hurry, at the end of the school year; the dialog has to be impossible to
 * misread, not pleasant to look at.
 */
export function TransferOwnershipDialog({
  organizationName,
  candidates,
}: {
  organizationName: string
  candidates: TransferCandidate[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<1 | 2>(1)
  const [selected, setSelected] = useState<string | null>(null)
  const [typed, setTyped] = useState('')
  const [pending, setPending] = useState(false)

  const recipient = candidates.find((candidate) => candidate.userId === selected)
  const confirmed =
    normalize(typed) !== '' && normalize(typed) === normalize(organizationName)

  function reset(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setStep(1)
      setSelected(null)
      setTyped('')
    }
  }

  async function transfer() {
    if (!recipient || !confirmed) return
    setPending(true)
    const result = await requestJson<{ email: EmailOutcome }>(
      '/api/settings/organization/transfer',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ newOwnerId: recipient.userId, confirmation: typed }),
      },
    )
    setPending(false)

    if (!result.ok) {
      toast.error(result.error.message)
      return
    }

    const note =
      result.value.email === 'sent'
        ? ' Email pemberitahuan terkirim ke kalian berdua.'
        : result.value.email === 'failed'
          ? ' Email pemberitahuan gagal terkirim; kabari penerimanya langsung.'
          : ''
    toast.success(`Kepemilikan diserahkan kepada ${recipient.name}.${note}`)
    reset(false)
    router.refresh()
  }

  return (
    <Dialog open={open} onOpenChange={reset}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          Serahkan kepemilikan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? 'Serahkan kepemilikan' : 'Konfirmasi serah terima'}
          </DialogTitle>
          <DialogDescription>
            Langkah {step} dari 2.{' '}
            {step === 1
              ? 'Pilih anggota yang akan menjadi pemilik baru.'
              : 'Periksa sekali lagi, lalu ketik nama organisasi.'}
          </DialogDescription>
        </DialogHeader>

        {step === 1 ? (
          <div className="space-y-4">
            <fieldset className="space-y-2">
              <legend className="sr-only">Pemilik baru</legend>
              {candidates.map((candidate) => (
                <label
                  key={candidate.userId}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors',
                    selected === candidate.userId
                      ? 'border-primary bg-primary/5'
                      : 'hover:bg-accent',
                  )}
                >
                  <input
                    type="radio"
                    name="new-owner"
                    value={candidate.userId}
                    checked={selected === candidate.userId}
                    onChange={() => setSelected(candidate.userId)}
                    className="accent-[hsl(var(--primary))]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{candidate.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {candidate.email} · {candidate.roleLabel}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => reset(false)}>
                Batal
              </Button>
              <Button type="button" disabled={!recipient} onClick={() => setStep(2)}>
                Lanjut
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="list-disc space-y-1.5 pl-5 text-sm">
              <li>
                <strong>{recipient?.name}</strong> menjadi pemilik {organizationName}.
              </li>
              <li>Kamu tetap di organisasi sebagai Admin.</li>
              <li>
                Hanya pemilik baru yang bisa menyerahkannya kembali — kamu tidak bisa
                membatalkannya sendiri.
              </li>
            </ul>
            <div className="space-y-2">
              <Label htmlFor="transfer-confirmation">
                Ketik <span className="font-semibold">{organizationName}</span> untuk
                konfirmasi
              </Label>
              <Input
                id="transfer-confirmation"
                value={typed}
                autoComplete="off"
                onChange={(event) => setTyped(event.target.value)}
              />
            </div>
            <div className="flex justify-between gap-2">
              <Button type="button" variant="ghost" onClick={() => setStep(1)}>
                Kembali
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={!confirmed || pending}
                onClick={transfer}
              >
                {pending ? 'Menyerahkan…' : 'Serahkan kepemilikan'}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

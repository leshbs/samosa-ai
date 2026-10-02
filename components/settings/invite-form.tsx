'use client'

import { Check, Copy } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestJson } from '@/modules/shared'
import type { InvitableRole } from '@/types/domain'
import { RolePicker } from './role-picker'

type Created = {
  url: string
  email: 'sent' | 'off' | 'failed'
  invitation: { email: string }
}

/**
 * Invite by link (checklist 5.3). The link is shown once, right here, because
 * the server keeps only its hash — there is no "show the link again". When
 * email is on it is also sent; when it is off, the screen says so and the
 * link is what the inviter passes on, usually in a group chat.
 *
 * `first` turns it into the first invitation of a solo workspace (ADR-0012):
 * the organization gets its name here, and the inviter is told — before, not
 * after — that everything already in the workspace becomes visible to whoever
 * joins. A warning only; there is no "keep these private" switch to offer.
 */
export type FirstInvitation = {
  /** The name the workspace has now, which nobody chose. */
  currentName: string
  datasets: number | null
  reports: number | null
}

/** "Ruang kerja budi" is a placeholder, not a name worth suggesting back. */
function suggestedName(current: string): string {
  return /^(ruang kerja|organisasi)\b/i.test(current.trim()) ? '' : current
}

function sharedSummary(first: FirstInvitation): string {
  if (first.datasets === null || first.reports === null) {
    return 'Semua dataset dan laporan di sini'
  }
  if (first.datasets === 0 && first.reports === 0) return ''
  return `${first.datasets} dataset dan ${first.reports} laporan di sini`
}

export function InviteForm({
  ttlDays,
  first,
}: {
  ttlDays: number
  first?: FirstInvitation
}) {
  const router = useRouter()
  const [organizationName, setOrganizationName] = useState(
    first ? suggestedName(first.currentName) : '',
  )
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<InvitableRole>('member')
  const [pending, setPending] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)
  const [copied, setCopied] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setPending(true)
    const result = await requestJson<Created>('/api/settings/invitations', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(first ? { email, role, organizationName } : { email, role }),
    })
    setPending(false)

    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setCreated(result.value)
    setCopied(false)
    setEmail('')
    // Not for the first invitation: refreshing turns the solo tab into the
    // member list, which would unmount this form and take the link — shown
    // only once — with it. The person refreshes when they have copied it.
    if (!first) router.refresh()
  }

  async function copy() {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.url)
      setCopied(true)
    } catch {
      toast.error('Tidak bisa menyalin otomatis. Pilih tautannya lalu salin manual.')
    }
  }

  const shared = first ? sharedSummary(first) : ''
  const nameMissing = Boolean(first) && organizationName.trim().length < 2

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4">
        {first && !created ? (
          <>
            <div className="space-y-2">
              <Label htmlFor="invite-organization">Nama organisasi</Label>
              <Input
                id="invite-organization"
                required
                maxLength={120}
                autoComplete="organization"
                placeholder="OSIS SMA Nusantara"
                value={organizationName}
                onChange={(event) => setOrganizationName(event.target.value)}
                aria-describedby="invite-organization-description"
              />
              <p
                id="invite-organization-description"
                className="text-xs text-muted-foreground"
              >
                Ini yang dibaca rekanmu di undangan, dan tercetak di laporan PDF.
              </p>
            </div>
            {shared ? (
              <p role="note" className="rounded-lg border bg-muted/40 p-3 text-sm">
                <span className="font-medium">{shared} akan terlihat oleh anggota.</span>{' '}
                Kalau ada yang sifatnya pribadi,{' '}
                <Link
                  href="/datasets"
                  className="font-medium underline underline-offset-4"
                >
                  hapus
                </Link>{' '}
                atau{' '}
                <Link
                  href="/settings?tab=data"
                  className="font-medium underline underline-offset-4"
                >
                  unduh
                </Link>{' '}
                dulu sebelum mengundang.
              </p>
            ) : null}
          </>
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            required
            autoComplete="off"
            placeholder="nama@sekolah.sch.id"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </div>
        <RolePicker
          name="invite-role"
          value={role}
          onChange={setRole}
          disabled={pending}
        />
        <Button type="submit" disabled={pending || email.trim() === '' || nameMissing}>
          {pending ? 'Membuat undangan…' : 'Buat undangan'}
        </Button>
      </form>

      {created ? (
        <div role="status" className="space-y-3 rounded-lg border bg-muted/40 p-4">
          <p className="text-sm font-medium">
            Undangan untuk {created.invitation.email} siap.
          </p>
          <p className="text-sm text-muted-foreground">
            {created.email === 'sent'
              ? 'Tautannya sudah dikirim lewat email. Kamu juga bisa membagikannya sendiri:'
              : created.email === 'failed'
                ? 'Email undangan gagal terkirim. Bagikan tautan ini sendiri:'
                : 'Pengiriman email belum aktif, jadi bagikan tautan ini sendiri — lewat WhatsApp atau email:'}
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={created.url}
              aria-label="Tautan undangan"
              onFocus={(event) => event.target.select()}
              className="font-mono text-xs"
            />
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? 'Tersalin' : 'Salin'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Berlaku {ttlDays} hari dan hanya bisa dipakai oleh akun dengan email yang
            diundang. Tautan ini hanya ditampilkan sekali.
          </p>
          {first ? (
            <Button type="button" size="sm" onClick={() => router.refresh()}>
              Selesai, lihat anggota
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

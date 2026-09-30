'use client'

import { Check, Copy } from 'lucide-react'
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
 */
export function InviteForm({ ttlDays }: { ttlDays: number }) {
  const router = useRouter()
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
      body: JSON.stringify({ email, role }),
    })
    setPending(false)

    if (!result.ok) {
      toast.error(result.error.message)
      return
    }
    setCreated(result.value)
    setCopied(false)
    setEmail('')
    router.refresh()
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

  return (
    <div className="space-y-5">
      <form onSubmit={submit} className="space-y-4">
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
        <Button type="submit" disabled={pending || email.trim() === ''}>
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
        </div>
      ) : null}
    </div>
  )
}

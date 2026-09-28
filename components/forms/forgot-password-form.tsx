'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { describeAuthError } from '@/lib/supabase/auth-error'
import { authRedirectUrl } from '@/lib/supabase/auth-links'
import { createClient } from '@/lib/supabase/client'
import { useCooldown } from './use-cooldown'

const forgotSchema = z.object({
  email: z.string().email('Masukkan email yang valid'),
})

type ForgotValues = z.infer<typeof forgotSchema>

const COOLDOWN_SECONDS = 60

export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false)
  const { remaining, start } = useCooldown(COOLDOWN_SECONDS)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ForgotValues>({ resolver: zodResolver(forgotSchema) })

  async function onSubmit(values: ForgotValues) {
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
      redirectTo: authRedirectUrl('/confirm', '/reset-password'),
    })

    // Supabase answers the same for a registered and an unknown address, and so
    // does this form: anything else would let it be used to test which emails
    // have accounts. Only an outage or a rate limit is worth reporting.
    if (error) {
      setError('root', {
        message: describeAuthError(error, 'Email tidak bisa dikirim. Coba lagi.'),
      })
      return
    }

    setSent(true)
    start()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="nama@sekolah.sch.id"
          {...register('email')}
        />
        {errors.email ? (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        ) : null}
      </div>

      {sent ? (
        <p
          role="status"
          className="rounded-control border bg-muted/60 px-3 py-2 text-sm text-muted-foreground"
        >
          Kalau email itu terdaftar, tautan untuk mengatur ulang password sudah dikirim.
          Cek inbox dan folder spam.
        </p>
      ) : null}
      {errors.root ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting || remaining > 0}>
        {isSubmitting
          ? 'Mengirim…'
          : remaining > 0
            ? `Kirim lagi dalam ${remaining} detik`
            : sent
              ? 'Kirim lagi'
              : 'Kirim tautan reset'}
      </Button>
    </form>
  )
}

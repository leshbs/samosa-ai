'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { describeAuthError } from '@/lib/supabase/auth-error'
import { authRedirectUrl } from '@/lib/supabase/auth-links'
import { createClient } from '@/lib/supabase/client'
import { readPendingEmail } from './pending-email'
import { useCooldown } from './use-cooldown'

const resendSchema = z.object({
  email: z.string().email('Masukkan email yang valid'),
})

type ResendValues = z.infer<typeof resendSchema>

const COOLDOWN_SECONDS = 60

/**
 * Sends the signup confirmation again. The address is prefilled from the form
 * the user just left; if it is not there (another tab, storage blocked) they
 * type it, which is also how someone who lost the email recovers.
 */
export function ResendConfirmationForm() {
  const [sent, setSent] = useState(false)
  const { remaining, start } = useCooldown(COOLDOWN_SECONDS)
  const {
    register,
    handleSubmit,
    setError,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ResendValues>({ resolver: zodResolver(resendSchema) })

  // Read after mount: session storage does not exist during server rendering.
  useEffect(() => {
    const pending = readPendingEmail()
    if (pending) setValue('email', pending)
  }, [setValue])

  async function onSubmit(values: ResendValues) {
    setSent(false)
    const supabase = createClient()
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: values.email,
      options: { emailRedirectTo: authRedirectUrl('/confirm', '/dashboard') },
    })

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
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email ? (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        ) : null}
      </div>

      {sent ? (
        <p role="status" className="text-sm text-muted-foreground">
          Email verifikasi dikirim ulang. Cek juga folder spam.
        </p>
      ) : null}
      {errors.root ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      ) : null}

      <Button
        type="submit"
        variant="outline"
        className="w-full"
        disabled={isSubmitting || remaining > 0}
      >
        {isSubmitting
          ? 'Mengirim…'
          : remaining > 0
            ? `Kirim ulang dalam ${remaining} detik`
            : 'Kirim ulang email verifikasi'}
      </Button>
    </form>
  )
}

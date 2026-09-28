'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { describeAuthError } from '@/lib/supabase/auth-error'
import { createClient } from '@/lib/supabase/client'

const resetSchema = z
  .object({
    // 72 is bcrypt's input limit; GoTrue rejects anything longer.
    password: z
      .string()
      .min(8, 'Password minimal 8 karakter')
      .max(72, 'Password maksimal 72 karakter'),
    confirm: z.string(),
  })
  .refine((values) => values.password === values.confirm, {
    path: ['confirm'],
    message: 'Kedua password tidak sama',
  })

type ResetValues = z.infer<typeof resetSchema>

/**
 * Sets a new password for the session the recovery link created (or, from the
 * settings page, for the signed-in user). The page itself is only reachable
 * with a session, so a missing one here means it expired while the form was open.
 */
export function ResetPasswordForm() {
  const [done, setDone] = useState(false)
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ResetValues>({ resolver: zodResolver(resetSchema) })

  async function onSubmit(values: ResetValues) {
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: values.password })

    if (error) {
      const expired =
        error.name === 'AuthSessionMissingError' || error.code === 'session_not_found'
      setError('root', {
        message: expired
          ? 'Sesimu sudah berakhir. Minta tautan reset baru.'
          : describeAuthError(error, 'Password tidak bisa disimpan. Coba lagi.'),
      })
      return
    }

    // Whoever knew the old password may still hold a session with it. Ending
    // every other session is the point of a reset; a failure here is not worth
    // alarming the user over, since the new password is already in force.
    await supabase.auth.signOut({ scope: 'others' })
    setDone(true)
  }

  if (done) {
    return (
      <div className="space-y-4">
        <p
          role="status"
          className="rounded-control border bg-muted/60 px-3 py-2 text-sm text-muted-foreground"
        >
          Password baru tersimpan. Sesi di perangkat lain sudah dikeluarkan.
        </p>
        <Button asChild className="w-full">
          <Link href="/dashboard">Lanjut ke dashboard</Link>
        </Button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="space-y-2">
        <Label htmlFor="password">Password baru</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Ulangi password baru</Label>
        <Input
          id="confirm"
          type="password"
          autoComplete="new-password"
          {...register('confirm')}
        />
        {errors.confirm ? (
          <p className="text-sm text-destructive">{errors.confirm.message}</p>
        ) : null}
      </div>

      {errors.root ? (
        <div role="alert" className="space-y-1 text-sm">
          <p className="text-destructive">{errors.root.message}</p>
          <Link href="/forgot-password" className="font-medium text-foreground underline">
            Minta tautan baru
          </Link>
        </div>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Menyimpan…' : 'Simpan password baru'}
      </Button>
    </form>
  )
}

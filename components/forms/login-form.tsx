'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { clientEnv } from '@/lib/env'
import { describeAuthError, isEmailNotConfirmed } from '@/lib/supabase/auth-error'
import { createClient } from '@/lib/supabase/client'
import { requestJson } from '@/modules/shared'
import { rememberPendingEmail } from './pending-email'

const loginSchema = z.object({
  email: z.string().email('Masukkan email yang valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter()
  const [unconfirmed, setUnconfirmed] = useState(false)
  // No reset or verification email to send without a domain (docs/auth-setup.md).
  const emailLinks = clientEnv.NEXT_PUBLIC_EMAIL_LINKS_ENABLED
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(values: LoginValues) {
    setUnconfirmed(false)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword(values)

    if (error) {
      // GoTrue only reports an unconfirmed address after the password matched,
      // so naming it reveals nothing a wrong guess could learn.
      if (isEmailNotConfirmed(error)) {
        rememberPendingEmail(values.email)
        setUnconfirmed(true)
        return
      }

      // Deliberately vague about *which* field was wrong: distinguishing the two
      // would confirm which emails exist. An outage is a different story — the
      // credentials were never judged, so saying they were is simply false.
      setError('root', {
        message: describeAuthError(error, 'Email atau password salah.'),
      })
      return
    }

    // A no-op for almost everyone. It finishes a first arrival whose
    // confirmation link never did — opened in another browser, or sent before
    // /confirm existed — instead of stranding it outside the dashboard.
    const provisioned = await requestJson('/api/auth/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ joining: redirectTo.startsWith('/invite/') }),
    })
    if (!provisioned.ok) {
      router.replace('/login?error=provisioning')
      router.refresh()
      return
    }

    // The session cookie was just written client-side; refresh so Server
    // Components re-render as the signed-in user.
    router.replace(redirectTo)
    router.refresh()
  }

  return (
    <form
      method="post"
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4"
      noValidate
    >
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

      <div className="space-y-2">
        <div className="flex items-baseline justify-between gap-4">
          <Label htmlFor="password">Password</Label>
          {emailLinks ? (
            <Link
              href="/forgot-password"
              className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
            >
              Lupa password?
            </Link>
          ) : null}
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        ) : null}
      </div>

      {unconfirmed ? (
        <div role="alert" className="space-y-1 text-sm">
          {emailLinks ? (
            <>
              <p className="text-destructive">
                Email kamu belum diverifikasi. Buka tautan yang kami kirim saat mendaftar.
              </p>
              <Link
                href="/verify-email"
                className="font-medium text-foreground underline"
              >
                Kirim ulang email verifikasi
              </Link>
            </>
          ) : (
            // Only an account made while verification was on can get here; there
            // is no email to resend, so a person has to confirm it by hand.
            <p className="text-destructive">
              Akun ini belum diaktifkan. Hubungi admin SAMOSA untuk mengaktifkannya.
            </p>
          )}
        </div>
      ) : null}

      {errors.root ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Memproses…' : 'Masuk'}
      </Button>
    </form>
  )
}

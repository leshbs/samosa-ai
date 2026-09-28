'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { describeAuthError } from '@/lib/supabase/auth-error'
import { authRedirectUrl } from '@/lib/supabase/auth-links'
import { createClient } from '@/lib/supabase/client'
import {
  FULL_NAME_METADATA_KEY,
  ORGANIZATION_NAME_METADATA_KEY,
} from '@/lib/supabase/user-metadata'
import { requestJson } from '@/modules/shared'
import { rememberPendingEmail } from './pending-email'

const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Nama minimal 2 karakter').max(120),
  organizationName: z
    .string()
    .trim()
    .min(2, 'Nama organisasi minimal 2 karakter')
    .max(120),
  email: z.string().email('Masukkan email yang valid'),
  // 72 is bcrypt's input limit; GoTrue rejects anything longer.
  password: z
    .string()
    .min(8, 'Password minimal 8 karakter')
    .max(72, 'Password maksimal 72 karakter'),
})

type SignupValues = z.infer<typeof signupSchema>

export function SignupForm() {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupValues>({ resolver: zodResolver(signupSchema) })

  async function onSubmit(values: SignupValues) {
    const supabase = createClient()
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        // Without this the confirmation link lands on the Site URL — the
        // landing page — where nothing redeems it.
        emailRedirectTo: authRedirectUrl('/confirm', '/dashboard'),
        // The organization name rides along in metadata: with confirmation on
        // there is no session yet, and /confirm creates the organization from it.
        data: {
          [FULL_NAME_METADATA_KEY]: values.fullName,
          [ORGANIZATION_NAME_METADATA_KEY]: values.organizationName,
        },
      },
    })

    if (error) {
      // "Coba email lain" is bad advice when the server is simply down.
      setError('root', {
        message: describeAuthError(error, 'Pendaftaran gagal. Coba email lain.'),
      })
      return
    }

    // With email confirmation on there is no session yet. This is also what an
    // already-registered address gets back — Supabase will not say which, and
    // neither do we.
    if (!data.session) {
      rememberPendingEmail(values.email)
      router.replace('/verify-email')
      return
    }

    const provisioned = await requestJson('/api/auth/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationName: values.organizationName }),
    })

    if (!provisioned.ok) {
      // The account exists either way, so point the user at signing in rather
      // than at filling this form in a second time.
      setError('root', {
        message: `Akun dibuat, tapi organisasi gagal disiapkan. ${provisioned.error.message}`,
      })
      return
    }

    router.replace('/dashboard')
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
        <Label htmlFor="fullName">Nama lengkap</Label>
        <Input id="fullName" autoComplete="name" {...register('fullName')} />
        {errors.fullName ? (
          <p className="text-sm text-destructive">{errors.fullName.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="organizationName">Nama organisasi</Label>
        <Input
          id="organizationName"
          placeholder="OSIS SMA Nusantara"
          autoComplete="organization"
          {...register('organizationName')}
        />
        {errors.organizationName ? (
          <p className="text-sm text-destructive">{errors.organizationName.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" {...register('email')} />
        {errors.email ? (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        ) : null}
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Password</Label>
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

      {errors.root ? (
        <p role="alert" className="text-sm text-destructive">
          {errors.root.message}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Mendaftarkan…' : 'Buat akun'}
      </Button>
    </form>
  )
}

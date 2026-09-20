'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'

const signupSchema = z.object({
  fullName: z.string().trim().min(2, 'Nama minimal 2 karakter').max(120),
  organizationName: z
    .string()
    .trim()
    .min(2, 'Nama organisasi minimal 2 karakter')
    .max(120),
  email: z.string().email('Masukkan email yang valid'),
  password: z.string().min(8, 'Password minimal 8 karakter'),
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
      options: { data: { full_name: values.fullName } },
    })

    if (error) {
      setError('root', { message: 'Pendaftaran gagal. Coba email lain.' })
      return
    }

    // With email confirmation on there is no session yet; /callback provisions
    // the organization instead once the user clicks the link in their inbox.
    if (!data.session) {
      router.replace('/login?pending=confirm')
      return
    }

    const response = await fetch('/api/auth/provision', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ organizationName: values.organizationName }),
    })

    if (!response.ok) {
      setError('root', { message: 'Akun dibuat, tapi organisasi gagal disiapkan.' })
      return
    }

    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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

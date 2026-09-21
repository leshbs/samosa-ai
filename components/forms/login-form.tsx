'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { createClient } from '@/lib/supabase/client'
import {
  BACKEND_UNREACHABLE_MESSAGE,
  isBackendUnreachable,
} from '@/lib/supabase/auth-error'

const loginSchema = z.object({
  email: z.string().email('Masukkan email yang valid'),
  password: z.string().min(1, 'Password wajib diisi'),
})

type LoginValues = z.infer<typeof loginSchema>

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const router = useRouter()
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  async function onSubmit(values: LoginValues) {
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword(values)

    if (error) {
      // Deliberately vague about *which* field was wrong: distinguishing the two
      // would confirm which emails exist. An outage is a different story — the
      // credentials were never judged, so saying they were is simply false.
      setError('root', {
        message: isBackendUnreachable(error)
          ? BACKEND_UNREACHABLE_MESSAGE
          : 'Email atau password salah.',
      })
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
        <Label htmlFor="password">Password</Label>
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

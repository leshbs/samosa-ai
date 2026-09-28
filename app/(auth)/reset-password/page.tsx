import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { ResetPasswordForm } from '@/components/forms/reset-password-form'
import { getAuthUser } from '@/modules/auth'

export const metadata: Metadata = { title: 'Atur password baru' }

/**
 * Reached from the recovery email (via /confirm, which signs the user in) or
 * from the settings page. Either way it needs a session; middleware redirects
 * without one, and this check covers a session that expired in between.
 */
export default async function ResetPasswordPage() {
  const user = await getAuthUser()
  if (!user.ok) redirect('/forgot-password?error=expired')

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold">Atur password baru</h1>
        <p className="text-sm text-muted-foreground">
          Untuk akun{' '}
          <span className="font-medium text-foreground">{user.value.email}</span>. Setelah
          disimpan, sesi di perangkat lain akan dikeluarkan.
        </p>
      </div>

      <ResetPasswordForm />
    </div>
  )
}

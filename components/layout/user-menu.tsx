'use client'

import { LogOut, User } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'

/**
 * Two letters is all that fits in the avatar circle. From a name it is the
 * first letter of each of the first two words, so "Rani Putri" reads RP rather
 * than RA; from an email there are no words to work with.
 */
function initials(label: string): string {
  const words = label.trim().split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return `${words[0]?.[0] ?? ''}${words[1]?.[0] ?? ''}`.toUpperCase()
  }
  return label.slice(0, 2).toUpperCase()
}

export function UserMenu({
  email,
  displayName,
  organizationName,
}: {
  email: string
  displayName: string
  organizationName: string
}) {
  // The name is what the user chose to be called; the email is the fallback
  // and stays visible in the menu either way, so nobody loses track of which
  // account they are in.
  const label = displayName.trim() || email
  const router = useRouter()

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.replace('/login')
    // Drops every cached Server Component render made as the old user.
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="gap-2 px-2"
          aria-label={`Menu akun untuk ${label}`}
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-medium">
            {initials(label)}
          </span>
          <span className="hidden text-sm sm:inline">{label}</span>
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="space-y-0.5">
          <span className="block truncate text-sm">{label}</span>
          {displayName.trim() && (
            <span className="block truncate text-xs font-normal text-muted-foreground">
              {email}
            </span>
          )}
          <span className="block truncate text-xs font-normal text-muted-foreground">
            {organizationName}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/settings')}>
          <User className="mr-2 h-4 w-4" aria-hidden />
          Profil
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={signOut}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden />
          Keluar
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

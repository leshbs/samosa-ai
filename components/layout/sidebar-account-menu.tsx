'use client'

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { ChevronsUpDown, LogOut, Moon, Sun, User } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTheme } from 'next-themes'
import { useRef } from 'react'
import { switchThemeWithTransition } from '@/components/layout/theme-transition'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

const ITEM =
  'h-9 cursor-pointer gap-2.5 rounded-lg px-3 text-[13px] font-medium focus:bg-secondary focus:text-foreground'

/**
 * The organization row at the foot of the sidebar (design_system.md §8.1,
 * block 4), which opens the account menu. The account card used to sit open
 * above it permanently; tucking it behind the organization keeps the sidebar
 * about navigation, and the menu is one click away for the rare visit.
 *
 * Radix DropdownMenu gives the menu roles, arrow-key movement, Escape, and
 * focus returning to the row, none of which a hand-rolled popover would.
 */
export function SidebarAccountMenu({
  email,
  displayName,
  organizationName,
}: {
  email: string
  displayName: string
  organizationName: string
}) {
  const router = useRouter()
  // The name is what the user chose to be called; the email is the fallback
  // and stays visible either way, so nobody loses track of which account
  // they are in.
  const name = displayName.trim() || email

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    // Back to the front door rather than the login form: leaving is not a
    // request to sign in again.
    router.replace('/')
    // Drops every cached Server Component render made as the old user.
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2.5 border-t border-white/[0.08] px-5 py-4 text-left transition-colors duration-fast hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[state=open]:bg-white/[0.06]">
        <span
          aria-hidden
          className="flex size-6 shrink-0 items-center justify-center rounded-md bg-white/10 text-[11px] font-bold text-white"
        >
          {organizationName.trim().charAt(0).toUpperCase() || 'O'}
        </span>
        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-white/70">
          <span className="sr-only">Akun dan organisasi: </span>
          {organizationName}
        </span>
        <ChevronsUpDown aria-hidden className="size-4 shrink-0 text-white/40" />
      </DropdownMenuTrigger>

      <DropdownMenuContent
        side="top"
        align="start"
        // Lines the menu up with the sidebar's 16px gutter, the width the old
        // card had.
        alignOffset={16}
        sideOffset={8}
        className="w-[calc(var(--radix-dropdown-menu-trigger-width)-2rem)] rounded-xl border-0 bg-card p-1.5 text-card-foreground shadow-md outline-none focus-visible:ring-0 dark:border dark:border-white/10"
      >
        <DropdownMenuLabel className="px-3 pb-2.5 pt-2 font-normal">
          <p className="truncate text-sm font-bold">{name}</p>
          {displayName.trim() ? (
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          ) : null}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="mx-1.5 my-0 bg-border" />
        <div className="pt-1">
          <DropdownMenuItem asChild className={ITEM}>
            <Link href="/settings">
              <User aria-hidden className="text-muted-foreground" />
              Profil &amp; pengaturan
            </Link>
          </DropdownMenuItem>
          <ThemeSwitchItem />
          <DropdownMenuItem
            onSelect={signOut}
            className={cn(
              ITEM,
              'text-ink-700 focus:bg-negative-surface focus:text-danger dark:text-foreground/80',
            )}
          >
            <LogOut aria-hidden />
            Keluar
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Inline, not a page (§8.1): toggling the theme should not navigate, and the
 * menu stays open so the user sees the result next to the control. A checkbox
 * item because the control has two states and says which one is on.
 *
 * The menu only renders after a click, by which point next-themes knows the
 * resolved theme — so unlike a switch painted on the server, `checked` never
 * starts out announcing the wrong state.
 */
function ThemeSwitchItem() {
  const { resolvedTheme, setTheme } = useTheme()
  const knob = useRef<HTMLSpanElement>(null)
  const isDark = resolvedTheme === 'dark'

  function toggle() {
    const apply = () => setTheme(isDark ? 'light' : 'dark')
    if (knob.current) switchThemeWithTransition(apply, knob.current)
    else apply()
  }

  return (
    <DropdownMenuPrimitive.CheckboxItem
      checked={isDark}
      onSelect={(event) => {
        event.preventDefault()
        toggle()
      }}
      className={cn(
        ITEM,
        'relative flex select-none items-center outline-none transition-colors',
      )}
    >
      {isDark ? (
        <Moon aria-hidden className="size-4 text-muted-foreground" />
      ) : (
        <Sun aria-hidden className="size-4 text-muted-foreground" />
      )}
      <span className="flex-1 text-left">Tema gelap</span>
      <span
        aria-hidden
        className={cn(
          'relative h-5 w-9 rounded-full transition-colors duration-fast',
          isDark ? 'bg-ember-600' : 'bg-input',
        )}
      >
        <span
          ref={knob}
          className={cn(
            'absolute left-0.5 top-0.5 size-4 rounded-full bg-white shadow-xs transition-transform duration-fast ease-standard',
            isDark && 'translate-x-4',
          )}
        />
      </span>
    </DropdownMenuPrimitive.CheckboxItem>
  )
}

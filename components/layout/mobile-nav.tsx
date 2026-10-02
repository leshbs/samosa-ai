'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Menu, X } from 'lucide-react'
import { useState } from 'react'
import { Logo } from '@/components/brand/logo'
import { Button } from '@/components/ui/button'

/**
 * Below 1024px the sidebar becomes a drawer (design_system.md §7.2). Radix
 * Dialog rather than a hand-rolled panel: focus trap, Escape, scroll lock and
 * focus return all come with it, and the slide is tailwindcss-animate CSS, so
 * the drawer adds no animation runtime to the page.
 *
 * The strip itself is the smallest possible top bar — the spec has none on
 * desktop, but on a phone the hamburger has to live somewhere.
 */
export function MobileNav({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)

  return (
    <header
      data-print="hide"
      className="flex h-14 items-center justify-between border-b bg-background px-4 lg:hidden"
    >
      <Logo href="/dashboard" />

      <Dialog.Root open={open} onOpenChange={setOpen}>
        <Dialog.Trigger asChild>
          <Button variant="ghost" size="icon" aria-label="Buka navigasi">
            <Menu aria-hidden />
          </Button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-950/50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <Dialog.Content
            // Close on any link inside: the route change would otherwise leave
            // the drawer open over the page the user just asked to see.
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('a')) setOpen(false)
            }}
            className="fixed inset-y-0 left-0 z-50 w-sidebar max-w-[85vw] shadow-lg duration-base data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left"
          >
            <Dialog.Title className="sr-only">Navigasi</Dialog.Title>
            <Dialog.Description className="sr-only">
              Menu utama dan akun.
            </Dialog.Description>
            {children}
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Tutup navigasi"
                className="absolute right-3 top-6 flex size-9 items-center justify-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X aria-hidden className="size-5" />
              </button>
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </header>
  )
}

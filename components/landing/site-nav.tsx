'use client'

import * as Dialog from '@radix-ui/react-dialog'
import { Menu, X } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Logo } from '@/components/brand/logo'
import { NAV_LINKS } from '@/components/landing/content'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * design_system.md §8.3: sticky, 68px, translucent cream with a 12px blur, and
 * a bottom border that only appears once the page has scrolled past 8px.
 *
 * "Has it scrolled" is answered by an IntersectionObserver on an 8px sentinel
 * at the top of the page rather than a scroll listener: the browser tells us
 * once when the answer changes, instead of us asking on every frame.
 */
export function SiteNav() {
  const sentinel = useRef<HTMLDivElement>(null)
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const element = sentinel.current
    if (!element || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(([entry]) =>
      setScrolled(!(entry?.isIntersecting ?? true)),
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <>
      <div ref={sentinel} aria-hidden className="absolute inset-x-0 top-0 h-2" />
      <header
        className={cn(
          'sticky top-0 z-50 h-[68px] border-b bg-[rgba(253,247,242,0.82)] backdrop-blur-md transition-colors duration-base',
          'dark:bg-[rgba(20,17,15,0.82)]',
          scrolled ? 'border-border' : 'border-transparent',
        )}
      >
        <div className="mx-auto flex h-full max-w-landing items-center justify-between gap-6 px-6 lg:px-10">
          <Logo />

          <nav aria-label="Navigasi utama" className="hidden md:block">
            <ul className="flex items-center gap-1">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <a
                    href={link.href}
                    className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 transition-colors duration-fast hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring dark:text-foreground/80"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="hidden items-center gap-2 md:flex">
            <Button asChild variant="ghost">
              <Link href="/login">Masuk</Link>
            </Button>
            <Button asChild>
              <Link href="/signup">Mulai gratis</Link>
            </Button>
          </div>

          <Dialog.Root open={open} onOpenChange={setOpen}>
            <Dialog.Trigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                aria-label="Buka menu"
              >
                <Menu aria-hidden />
              </Button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-50 bg-ink-950/40 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
              <Dialog.Content
                onClick={(event) => {
                  if ((event.target as HTMLElement).closest('a')) setOpen(false)
                }}
                className="fixed inset-x-0 top-0 z-50 border-b bg-background px-6 pb-6 pt-4 shadow-md duration-base data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top"
              >
                <div className="flex items-center justify-between">
                  <Logo />
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" aria-label="Tutup menu">
                      <X aria-hidden />
                    </Button>
                  </Dialog.Close>
                </div>
                <Dialog.Title className="sr-only">Menu</Dialog.Title>
                <Dialog.Description className="sr-only">
                  Bagian halaman dan masuk ke akun.
                </Dialog.Description>
                <ul className="mt-6 space-y-1">
                  {NAV_LINKS.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        className="block rounded-lg px-3 py-3 text-base font-semibold hover:bg-secondary"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Button asChild variant="outline">
                    <Link href="/login">Masuk</Link>
                  </Button>
                  <Button asChild>
                    <Link href="/signup">Mulai gratis</Link>
                  </Button>
                </div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </header>
    </>
  )
}

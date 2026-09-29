'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { UserAvatar } from '@/components/ui/user-avatar'
import { requestJson } from '@/modules/shared'
import { MAX_IMAGE_BYTES } from '@/types/api'

/**
 * Logo or avatar: pick a file, it uploads, the preview swaps. No crop step —
 * the image is shown with `object-cover` on screen and `contain` in the PDF,
 * so a reasonable picture needs no editing, and a crop tool is a lot of UI
 * for the few who would use it.
 *
 * The size is checked here too, before a 6 MB phone photo spends the user's
 * data on an upload the server will refuse.
 */
export function ImageUploadField({
  label,
  endpoint,
  initialUrl,
  fallbackName,
  shape,
  savedMessage,
  removedMessage,
}: {
  label: string
  /** POST with a `file` field; DELETE to clear. Both answer `{ imageUrl }`. */
  endpoint: string
  initialUrl: string | null
  /** Initials are drawn from this when there is no picture. */
  fallbackName: string
  shape: 'circle' | 'square'
  savedMessage: string
  removedMessage: string
}) {
  const router = useRouter()
  const input = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState(initialUrl)
  const [busy, setBusy] = useState(false)

  async function upload(file: File) {
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error('Gambar maksimal 1 MB. Perkecil dulu ukurannya, lalu unggah lagi.')
      return
    }

    const form = new FormData()
    form.append('file', file)
    setBusy(true)
    const saved = await requestJson<{ imageUrl: string | null }>(endpoint, {
      method: 'POST',
      body: form,
    })
    setBusy(false)

    if (!saved.ok) {
      toast.error(saved.error.message)
      return
    }
    setUrl(saved.value.imageUrl)
    toast.success(savedMessage)
    router.refresh()
  }

  async function remove() {
    setBusy(true)
    const removed = await requestJson(endpoint, { method: 'DELETE' })
    setBusy(false)

    if (!removed.ok) {
      toast.error(removed.error.message)
      return
    }
    setUrl(null)
    toast.success(removedMessage)
    router.refresh()
  }

  return (
    <div className="flex items-center gap-4">
      <UserAvatar name={fallbackName} imageUrl={url} size="lg" shape={shape} />
      <div className="space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {busy
              ? 'Menyimpan…'
              : url
                ? `Ganti ${label.toLowerCase()}`
                : `Unggah ${label.toLowerCase()}`}
          </Button>
          {url ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={remove}
            >
              Hapus
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">PNG atau JPEG, maksimal 1 MB.</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="sr-only"
        tabIndex={-1}
        aria-label={label}
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Reset so choosing the same file again still fires a change.
          event.target.value = ''
          if (file) void upload(file)
        }}
      />
    </div>
  )
}

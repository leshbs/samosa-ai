'use client'

import { Trash2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { requestJson } from '@/modules/shared'

/**
 * Deleting cascades to every response in the dataset, so it asks first.
 * A shadcn AlertDialog would be nicer; confirm() keeps the MVP dependency-free.
 */
export function DeleteDatasetButton({
  datasetId,
  datasetName,
  redirectTo,
}: {
  datasetId: string
  datasetName: string
  redirectTo?: string
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function remove() {
    const confirmed = window.confirm(
      `Hapus "${datasetName}" beserta seluruh aspirasinya? Tindakan ini tidak bisa dibatalkan.`,
    )
    if (!confirmed) return

    setPending(true)
    const deleted = await requestJson(`/api/datasets/${datasetId}`, {
      method: 'DELETE',
    })
    setPending(false)

    if (!deleted.ok) {
      toast.error(deleted.error.message)
      return
    }

    toast.success('Dataset dihapus.')
    if (redirectTo) router.replace(redirectTo)
    router.refresh()
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={remove}
      disabled={pending}
      aria-label={`Hapus dataset ${datasetName}`}
    >
      <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
    </Button>
  )
}

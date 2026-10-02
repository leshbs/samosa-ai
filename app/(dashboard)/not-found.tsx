import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

/**
 * `notFound()` on a dataset, job or report lands here. RLS makes "belongs to
 * another organization" and "does not exist" indistinguishable, and that is the
 * correct behaviour — so the copy deliberately covers both without guessing.
 */
export default function DashboardNotFound() {
  return (
    <div className="max-w-md">
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <p className="font-medium">Tidak ditemukan</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Halaman ini tidak ada, sudah dihapus, atau bukan untuk akunmu.
          </p>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard">Kembali ke beranda</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

import { Upload } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { EmptyState } from '@/components/layout/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getSessionUser } from '@/modules/auth'
import { listDatasets } from '@/modules/ingestion'
import { formatDateTime } from '@/lib/utils'

export const metadata: Metadata = { title: 'Beranda' }

export default async function DashboardHomePage() {
  const session = await getSessionUser()
  const datasets = await listDatasets()
  const items = datasets.ok ? datasets.value : []
  const totalResponses = items.reduce((sum, dataset) => sum + dataset.responseCount, 0)

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">
          {session.ok ? session.value.organizationName : 'Beranda'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Ringkasan aspirasi yang sudah masuk ke SAMOSA.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Upload}
          title="Belum ada dataset"
          description="Unggah hasil Google Forms dalam format CSV atau Excel untuk mulai menganalisis aspirasi."
          action={{ label: 'Unggah dataset pertama', href: '/datasets/new' }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Dataset
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{items.length}</CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total aspirasi
              </CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">{totalResponses}</CardContent>
          </Card>

          <Card className="sm:col-span-2">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Unggahan terbaru
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {items.slice(0, 5).map((dataset) => (
                <Link
                  key={dataset.id}
                  href={`/datasets/${dataset.id}`}
                  className="flex items-center justify-between rounded-md px-2 py-2 text-sm hover:bg-secondary/60"
                >
                  <span className="font-medium">{dataset.name}</span>
                  <span className="text-muted-foreground">
                    {formatDateTime(dataset.createdAt)}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </section>
  )
}

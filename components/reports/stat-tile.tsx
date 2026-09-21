import { Card, CardContent } from '@/components/ui/card'

/**
 * A headline number is not a one-bar chart. Total responses, share positive
 * and the loudest topic each carry their own meaning and no comparison
 * between them, so they get tiles rather than a grouped bar.
 */
export function StatTile({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail?: string
}) {
  return (
    <Card>
      <CardContent className="space-y-1 py-5">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        {/* Proportional figures, not tabular: these do not align in a column,
            and equal-width digits look loose at this size. */}
        <p className="text-3xl font-semibold leading-tight">{value}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  )
}

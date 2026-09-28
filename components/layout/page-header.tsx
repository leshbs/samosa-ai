import { Fragment } from 'react'
import Link from 'next/link'
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbLink,
} from '@/components/ui/breadcrumb'

export type Crumb = { label: string; href?: string }

/**
 * One page heading, used everywhere, so §5's "always include a breadcrumb and a
 * visible back path" is satisfied by construction rather than remembered per
 * page. The last crumb is the current page and is rendered as text, not a link.
 *
 * The description is capped to the narrative spine: it is prose, and the pages
 * below it are 1100px wide.
 */
export function PageHeader({
  title,
  description,
  crumbs = [],
  actions,
}: {
  title: string
  description?: string
  crumbs?: Crumb[]
  actions?: React.ReactNode
}) {
  return (
    <div className="space-y-3">
      {crumbs.length > 0 ? (
        <Breadcrumb>
          <BreadcrumbList>
            {/* The separator renders its own <li>, so it is a sibling of the
                item rather than a child of it. */}
            {crumbs.map((crumb, index) => (
              <Fragment key={`${crumb.label}-${index}`}>
                <BreadcrumbItem>
                  {crumb.href ? (
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  ) : (
                    <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                  )}
                </BreadcrumbItem>
                {index < crumbs.length - 1 ? <BreadcrumbSeparator /> : null}
              </Fragment>
            ))}
          </BreadcrumbList>
        </Breadcrumb>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 space-y-1.5">
          <h1 className="text-h2 sm:text-h1">{title}</h1>
          {description ? (
            <p className="max-w-narrative text-body text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}

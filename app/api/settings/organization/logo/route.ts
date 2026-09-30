import {
  clearOrganizationLogo,
  getSessionUser,
  setOrganizationLogo,
  signBrandingUrl,
} from '@/modules/auth'
import { readImageField } from '@/app/api/_lib/image-upload'
import { failure, success } from '@/app/api/_lib/respond'

/** Owner only; the service checks the role, since it writes with the service role. */
export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const bytes = await readImageField(request)
  if (!bytes.ok) return failure(bytes.error)

  const result = await setOrganizationLogo(session.value, bytes.value)
  if (!result.ok) return failure(result.error)

  return success({ imageUrl: await signBrandingUrl(result.value.logoPath) })
}

export async function DELETE() {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const result = await clearOrganizationLogo(session.value)
  return result.ok ? success({ imageUrl: null }) : failure(result.error)
}

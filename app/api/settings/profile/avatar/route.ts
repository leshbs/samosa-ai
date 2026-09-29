import { clearAvatar, getSessionUser, setAvatar, signBrandingUrl } from '@/modules/auth'
import { readImageField } from '@/app/api/_lib/image-upload'
import { failure, success } from '@/app/api/_lib/respond'

export async function POST(request: Request) {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const bytes = await readImageField(request)
  if (!bytes.ok) return failure(bytes.error)

  // The user id is the session's, so nobody can set another person's picture.
  const result = await setAvatar(session.value.userId, bytes.value)
  if (!result.ok) return failure(result.error)

  return success({ imageUrl: await signBrandingUrl(result.value.avatarPath) })
}

export async function DELETE() {
  const session = await getSessionUser()
  if (!session.ok) return failure(session.error)

  const result = await clearAvatar(session.value.userId)
  return result.ok ? success({ imageUrl: null }) : failure(result.error)
}

import { InviteForm } from '@/components/settings/invite-form'
import {
  MemberActions,
  RevokeInvitationButton,
} from '@/components/settings/member-actions'
import { Badge } from '@/components/ui/badge'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { UserAvatar } from '@/components/ui/user-avatar'
import { countReports } from '@/modules/analysis'
import {
  INVITATION_TTL_DAYS,
  can,
  describeFullWorkspace,
  getWorkspaceCapacity,
  listMembers,
  listPendingInvitations,
  type SessionUser,
} from '@/modules/auth'
import { countDatasets } from '@/modules/ingestion'
import { formatDateTime } from '@/lib/utils'
import {
  ORG_ROLES,
  ROLE_DESCRIPTIONS,
  ROLE_LABELS,
  type InvitableRole,
} from '@/types/domain'

export async function MembersTab({ session }: { session: SessionUser }) {
  if (session.solo) return <FirstInvitation session={session} />

  const canInvite = can(session.role, 'member:invite')
  const canManage = can(session.role, 'member:manage')

  const [members, invitations, capacity] = await Promise.all([
    listMembers(session.organizationId),
    canInvite ? listPendingInvitations(session.organizationId) : null,
    canInvite ? getWorkspaceCapacity(session.organizationId) : null,
  ])

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Anggota{members.ok ? ` (${members.value.length})` : ''}
          </CardTitle>
          <CardDescription>
            Setiap orang masuk dengan akunnya sendiri — tidak perlu berbagi password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {members.ok ? (
            <ul className="divide-y">
              {members.value.map((member) => {
                const name = member.displayName || member.email
                const self = member.userId === session.userId
                const editable = canManage && !self && member.role !== 'owner'
                return (
                  <li
                    key={member.userId}
                    className="flex flex-wrap items-center gap-3 py-3"
                  >
                    <UserAvatar name={name} imageUrl={member.avatarUrl} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {name}
                        {self ? (
                          <span className="text-muted-foreground"> (kamu)</span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[member.displayName ? member.email : null, member.title || null]
                          .filter(Boolean)
                          .join(' · ') || 'Belum mengisi jabatan'}
                      </p>
                    </div>
                    <Badge variant="outline">{ROLE_LABELS[member.role]}</Badge>
                    {editable ? (
                      <MemberActions
                        userId={member.userId}
                        name={name}
                        role={member.role as InvitableRole}
                      />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{members.error.message}.</p>
          )}
        </CardContent>
      </Card>

      {capacity ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Undang anggota</CardTitle>
            <CardDescription>
              Tautan undangan berlaku {INVITATION_TTL_DAYS} hari, untuk satu alamat email.
              {capacity.maxMembers !== null
                ? ` Terpakai ${capacity.members + capacity.pending} dari ${capacity.maxMembers} tempat, termasuk undangan yang menunggu.`
                : ''}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* No form that can only answer "no": a full workspace gets the
                reason and what frees a place instead. */}
            {capacity.hasRoom ? (
              <InviteForm ttlDays={INVITATION_TTL_DAYS} />
            ) : (
              <p className="text-sm">{describeFullWorkspace(capacity)}</p>
            )}
          </CardContent>
        </Card>
      ) : null}

      {invitations ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Undangan tertunda</CardTitle>
          </CardHeader>
          <CardContent>
            {!invitations.ok ? (
              <p className="text-sm text-muted-foreground">
                {invitations.error.message}.
              </p>
            ) : invitations.value.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Tidak ada undangan yang menunggu diterima.
              </p>
            ) : (
              <ul className="divide-y">
                {invitations.value.map((invitation) => (
                  <li
                    key={invitation.id}
                    className="flex flex-wrap items-center gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{invitation.email}</p>
                      <p className="text-xs text-muted-foreground">
                        {ROLE_LABELS[invitation.role]} ·{' '}
                        {invitation.expired
                          ? 'kedaluwarsa — undang lagi untuk tautan baru'
                          : `berlaku sampai ${formatDateTime(invitation.expiresAt, session.organizationTimezone)}`}
                      </p>
                    </div>
                    <RevokeInvitationButton id={invitation.id} email={invitation.email} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Arti setiap peran</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            {ORG_ROLES.map((role) => (
              <div key={role}>
                <dt className="font-medium">{ROLE_LABELS[role]}</dt>
                <dd className="text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * What the tab is while the workspace is one person (ADR-0012): no member
 * list of one, no table of roles — just the way to stop being alone. This is
 * the moment the workspace becomes an organization, so it is also where its
 * name is asked for and where the person is told what the invitee will see.
 */
async function FirstInvitation({ session }: { session: SessionUser }) {
  const [datasets, reports] = await Promise.all([
    countDatasets(session.organizationId),
    countReports(session.organizationId),
  ])

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Undang rekan</CardTitle>
        <CardDescription>
          Bekerja bersama pengurus lain? Setiap orang masuk dengan akunnya sendiri — tidak
          perlu berbagi password. Tautan undangan berlaku {INVITATION_TTL_DAYS} hari,
          untuk satu alamat email.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <InviteForm
          ttlDays={INVITATION_TTL_DAYS}
          first={{
            currentName: session.organizationName,
            datasets: datasets.ok ? datasets.value : null,
            reports: reports.ok ? reports.value : null,
          }}
        />
      </CardContent>
    </Card>
  )
}

import { describe, expect, it } from 'vitest'
import { belongsToOrganization, can } from '@/modules/auth/policies/org-policy'

describe('org policy', () => {
  it('lets owners do everything', () => {
    expect(can('owner', 'org:manage')).toBe(true)
    expect(can('owner', 'dataset:delete')).toBe(true)
  })

  it('stops members from deleting datasets or inviting', () => {
    expect(can('member', 'dataset:create')).toBe(true)
    expect(can('member', 'dataset:delete')).toBe(false)
    expect(can('member', 'member:invite')).toBe(false)
  })

  it('limits viewers to exports', () => {
    expect(can('viewer', 'report:export')).toBe(true)
    expect(can('viewer', 'analysis:run')).toBe(false)
  })

  it('rejects cross-organization access', () => {
    expect(belongsToOrganization('org-a', 'org-b')).toBe(false)
    expect(belongsToOrganization('org-a', 'org-a')).toBe(true)
  })
})

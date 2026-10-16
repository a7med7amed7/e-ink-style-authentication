# Hard delete vs soft delete by table lifecycle

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/EndUserInvitationRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `afce75f8` — Replace Prisma with Drizzle

## Before (rejected / buggy)
All entities assumed soft-delete via `deletedAt` — invitations table has no `deletedAt` column.

## After (accepted / fixed)
**Soft-delete entities** (users, orgs, departments): `softDeleteTimestamps()` + `isNull(deletedAt)` on reads.

**Invitation lifecycle** uses status + hard delete:

```typescript
// no deletedAt on this table — status field governs lifecycle

async hardDeletePending(id: string, tx?: UsersDbOrTx) {
  return db.delete(endUserInvitations).output()
    .where(and(
      eq(endUserInvitations.id, id),
      eq(endUserInvitations.invitation_status, 'pending')
    ));
}

async revokeByDepartmentIds(deptIds: string[], tx: UsersDbOrTx) {
  await tx.update(endUserInvitations)
    .set({ invitation_status: 'revoked', ...touchUpdatedAt() })
    .where(inArray(endUserInvitations.department_id, deptIds));
}
```

**OTP/temp passwords** use physical `delete` in cleanup schedulers (`OtpRepository.cleanupExpired`).

## Why it matters
Repository skill must not blindly apply soft-delete helpers to every table. Match lifecycle: transient tokens → hard delete; core entities → soft delete; workflow rows → status enum.

## Skill candidate tag
timestamps-soft-delete

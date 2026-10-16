# Encode workflow eligibility in SQL WHERE clauses

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `537e774c` — feat(users): [WMS-370] add user approval backend changes
- Commit: `5f4955aa` — feat(users): [WMS-373] user org invitation approval flow
- File: `modules/users/backend/src/repositories/DepartmentUserRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
Available-user query only checked `active` and org-type join; invited unverified users could appear in pickers.

```typescript
const conditions: SQL[] = [isNull(users.deletedAt), eq(users.active, true)];
if (opts.orgType === 'external') {
  conditions.push(eq(users.is_verified, true));
}
```

## After (accepted / fixed)
Repository encodes business eligibility in SQL:

```typescript
const conditions: SQL[] = [
  isNull(users.deletedAt),
  eq(users.active, true),
  eq(users.is_verified, true),
  eq(users.approval_status, 'approved'),
];
```

Department user joins require `eq(users.is_verified, true)` and active flags on bridge tables. Pending approval list adds `eq(users.approval_status, 'pending')`.

## Why it matters
Authorization-adjacent rules (who can be assigned, who appears in admin queues) belong in the repository query, not filtered in service loops — prevents TOCTOU and N+1 filtering.

## Skill candidate tag
authz-in-sql

# Bulk insert without `.output()` when rows not needed

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/OrganizationRoleRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories
- File: `modules/users/backend/src/repositories/DepartmentUserRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
N/A — introduced with org bootstrap.

## After (accepted / fixed)
Seed-style bulk writes omit `.output()` and document caller responsibility:

```typescript
// fire-and-forget — caller re-fetches via findByOrganization if rows are needed
async bulkCreate(rows: CreateOrgRoleInput[], tx: UsersDbOrTx) {
  if (rows.length === 0) return;
  await tx.insert(organizationRoles).values(
    rows.map((r) => ({ ...r, ...insertTimestamps() }))
  );
}
```

`DepartmentUserRepository.bulkCreate` same pattern — required `tx`, empty guard, spreads `insertTimestamps()` per row.

Contrast: single-row `create` always uses `.output()` and returns `inserted[0]!`.

## Why it matters
MSSQL `OUTPUT` on multi-row inserts has overhead. When service only needs IDs from schema defaults or will re-query, skip `.output()`. Skill should distinguish single-write-return vs bulk fire-and-forget.

## Skill candidate tag
write-return

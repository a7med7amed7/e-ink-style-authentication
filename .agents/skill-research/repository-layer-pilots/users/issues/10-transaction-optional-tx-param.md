# Optional transaction handle (`UsersDbOrTx`)

## Service
users

## Evidence
- File: `modules/users/backend/src/db/client.ts`
- Commit: `5276a42d` — feat(services): [WMS-220] add org services and zod schemas
- File: `modules/users/backend/src/repositories/OrganizationRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
Early Drizzle client exported only `UsersDb`. Org write flows could not participate in service-level transactions.

```typescript
export type UsersDb = typeof db;
// no transaction union type
```

## After (accepted / fixed)
```typescript
export type UsersDbOrTx =
  UsersDb | Parameters<Parameters<UsersDb['transaction']>[0]>[0];
```

Repository methods accept optional `tx`:

```typescript
async findById(id: string, tx?: UsersDbOrTx) {
  const db = tx ?? this.db;
  return db.select(...);
}

async softDeleteByOrganization(orgId: string, tx: UsersDbOrTx) {
  await tx.update(departments).set(softDeleteTimestamps())...
}
```

Some bulk writes require `tx` (non-optional) when caller must be inside a transaction (`bulkCreate`, `revokeByDepartmentIds`).

## Why it matters
Multi-table org create/delete needs atomic commits. Repos must not call `this.db.transaction()` internally when the service already owns the transaction boundary.

## Skill candidate tag
transactions

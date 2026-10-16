# MSSQL INSERT/UPDATE RETURNING via `.output()`

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `afce75f8` — Replace Prisma with Drizzle
- File: `modules/users/backend/src/repositories/OtpRepository.ts`
- Commit: `afce75f8` — Replace Prisma with Drizzle
- File: `modules/users/backend/src/repositories/EndUserInvitationRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
Prisma `create` / `update` returned the entity directly. No Drizzle pattern established.

## After (accepted / fixed)
SQL Server driver uses `.output()` to return written rows:

```typescript
const inserted = await this.db
  .insert(users)
  .output()
  .values({ ...data, ...insertTimestamps() });
return inserted[0]!;

const rows = await this.db
  .update(users)
  .set({ ...touchUpdatedAt() })
  .output()
  .where(eq(users.id, id));
return rows[0] ?? null;
```

Hard deletes also use `.output()` where the deleted row is needed (`EndUserInvitationRepository.hardDeletePending`).

## Why it matters
Without `.output()`, services must re-fetch after write — extra round trip and race window. Skill should document when `.output()` is required vs optional.

## Skill candidate tag
write-return

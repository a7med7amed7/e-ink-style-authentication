# Always stamp updatedAt on repository writes

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `507d453d` — `feat(file): [WMS-346] File service initial setup`
- Related: `cbf52c63` / `715bedc2` — `updateFileMetadata` keeps `updatedAt: new Date()` while spreading optional `expiresAt`; tests assert `updatedAt: expect.any(Date)` on `updateStatus`

## Before (rejected / buggy)
Relying only on SQL `CURRENT_TIMESTAMP` defaults updates `createdAt`/`updatedAt` on insert — not on subsequent `.update().set(...)`. Rows can change status/metadata while `updatedAt` stays stale.

## After (accepted / fixed)
```typescript
const updateData: Partial<File> = {
  status,
  updatedAt: new Date(),
};

// promoteFiles / softDeleteFiles / updateFileMetadata all set updatedAt: new Date()
```

Schema still defaults:
```typescript
updatedAt: c.datetime2('updatedAt').notNull().default(sql`CURRENT_TIMESTAMP`),
```

## Why it matters
Audit, cleanup, and “last changed” queries depend on `updatedAt`. App-level stamps on every mutation keep them honest when the DB default only fires on insert.

## Skill candidate tag
timestamps-soft-delete

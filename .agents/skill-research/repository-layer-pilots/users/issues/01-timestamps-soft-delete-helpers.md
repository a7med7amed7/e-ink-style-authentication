# Explicit timestamp helpers for Drizzle on SQL Server

## Service
users

## Evidence
- File: `modules/users/backend/src/db/timestamps.ts`
- Commit: `afce75f8` — Replace Prisma with Drizzle
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `afce75f8` — Replace Prisma with Drizzle

## Before (rejected / buggy)
Prisma managed `createdAt` / `updatedAt` implicitly. Soft delete used `deletedAt: null` in Prisma `where` clauses without a shared helper for setting timestamps on delete.

```typescript
// Prisma era — no app-level timestamp helper
return this.prisma.user.create({ data });
// updates relied on Prisma/DB defaults
```

## After (accepted / fixed)
Dedicated helpers document that MSSQL does not auto-refresh `updatedAt` on update:

```typescript
export function insertTimestamps() {
  const t = new Date();
  return { createdAt: t, updatedAt: t };
}
export function touchUpdatedAt() {
  return { updatedAt: new Date() };
}
export function softDeleteTimestamps() {
  const t = new Date();
  return { deletedAt: t, updatedAt: t };
}
```

Every insert spreads `...insertTimestamps()`, every update merges `...touchUpdatedAt()`, soft deletes use `softDeleteTimestamps()`. Reads add `isNull(table.deletedAt)`.

## Why it matters
Without explicit helpers, `updatedAt` drifts stale and soft-deleted rows leak into list queries. A repository skill should mandate the three helpers and `isNull(deletedAt)` on all non-admin reads.

## Skill candidate tag
timestamps-soft-delete

# DB clock for timestamps and soft delete

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/db/timestamps.ts`
- Commit: `47b2af84` — initial helpers used `new Date()`
- Commit: `5aea58ea` — `refactor(forms): [WMS-15] align modules with ddd layout and shared audit auth`

## Before (rejected / buggy)
```ts
export function insertTimestamps() {
  const t = new Date();
  return { createdAt: t, updatedAt: t };
}
export function touchUpdatedAt() {
  return { updatedAt: new Date() };
}
```
App clock diverged from SQL Server `DEFAULT CURRENT_TIMESTAMP` and from other writers.

## After (accepted / fixed)
```ts
export function insertTimestamps(): Record<string, never> {
  return {}; // rely on DB defaults
}
export function touchUpdatedAt() {
  return { updatedAt: sql`CURRENT_TIMESTAMP` };
}
export function softDeleteAt() {
  return { deletedAt: sql`CURRENT_TIMESTAMP` };
}
```
Repositories spread `touchUpdatedAt()` / `softDeleteAt()` on updates; inserts omit timestamp fields.

## Why it matters
Repository layers should not invent wall-clock times for audit columns. DB defaults keep inserts/updates consistent across services, migrations, and bulk SQL.

## Skill candidate tag
timestamps-soft-delete

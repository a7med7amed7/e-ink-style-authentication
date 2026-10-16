# Single-query bulk lookup with `inArray` (reject over-engineered validation)

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `7c68dfbc` — Log Service: Init commit before rebasing (resolved conflicts)
- Commit: `18cb82f2` — fix(ci): [WMS-17] Adjusting Duo's reviews v2
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
**Review-added verbose validation** (numeric ID era) with logging:

```typescript
const validIds: number[] = [];
const invalidInputs: unknown[] = [];
for (const id of ids) {
  // parse string to int, push invalid to array...
}
if (invalidInputs.length > 0) {
  console.warn(`UserRepository.findManyByIds: Filtered out ...`, invalidInputs);
}
const unique = [...new Set(validIds)];
```

This was never carried forward after UUID migration.

## After (accepted / fixed)
Minimal sanitization — dedupe, trim, empty guard, one query:

```typescript
const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id.trim() !== ''))];
if (unique.length === 0) return [];
const conditions: SQL[] = [inArray(users.id, unique), isNull(users.deletedAt)];
if (options.activeOnly) conditions.push(eq(users.active, true));
const rows = await this.db.select({ ... }).from(users).where(and(...conditions));
```

`activeOnly` filter added (`1c1fecd6`) for notification recipient fan-out.

## Why it matters
Bulk enrichment endpoints must avoid N+1. Input validation belongs at the HTTP/schema boundary; repository filters invalid IDs silently and returns partial results.

## Skill candidate tag
batching-n1

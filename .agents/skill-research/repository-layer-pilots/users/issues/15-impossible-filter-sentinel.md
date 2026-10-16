# Impossible-filter sentinel (`sql\`1 = 0\``)

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `5f4955aa` — feat(users): [WMS-373] user org invitation approval flow

## Before (rejected / buggy)
External org user picker required `categoryId` but query proceeded without it when missing — could return unscoped users.

```typescript
if (opts.orgType === 'external') {
  conditions.push(eq(users.is_verified, true));
  if (opts.categoryId) conditions.push(eq(users.category_id, opts.categoryId));
}
```

## After (accepted / fixed)
Missing required filter yields empty result set in SQL:

```typescript
if (opts.orgType === 'external') {
  conditions.push(opts.categoryId ? eq(users.category_id, opts.categoryId) : sql`1 = 0`);
} else {
  conditions.push(isNull(users.category_id));
}
```

## Why it matters
When a filter combination is invalid, returning `[]` from JS is racy if the query runs anyway. `1 = 0` documents intent and keeps count/list queries consistent.

## Skill candidate tag
filter-edge-cases

# Guard Drizzle or() result before pushing to condition array

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/repositories/AuditLogRepository.ts`
- Commit: `51cd19cc` — `feat(log): [WMS-19] Audit logs - Adjusting Duo reviews 2` (re-introduced guard)
- Commit: `9572a411` — `feat(log): [WMS-19] Audit logs - Adjusting Duo reviews` (removed guard, used `!` assertion)

## Before (rejected / buggy)
```typescript
filterConditions.push(
  or(
    like(sql`JSON_VALUE(...)`, `%${filters.auth_action}%`),
    like(sql`JSON_VALUE(...)`, `%${filters.auth_action}%`)
  )!  // non-null assertion — masks possible undefined
);
```

## After (accepted / fixed)
```typescript
const authActionCondition = or(
  like(sql`JSON_VALUE(...)`, `%${escapedAuthAction}%`),
  like(sql`JSON_VALUE(...)`, `%${escapedAuthAction}%`)
);
if (authActionCondition) {
  filterConditions.push(authActionCondition);
}
```

## Why it matters
Drizzle's `or()` can return `undefined` when called with no valid arguments. Asserting non-null or pushing unconditionally risks runtime errors or invalid `and(...)` clauses.

## Skill candidate tag
other:drizzle-or-null-guard

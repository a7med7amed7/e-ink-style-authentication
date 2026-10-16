# Build WHERE clauses from optional filter predicates

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `6480dfc4` — feat: add external + internal services and routes
- Commit: `47a887b8` — feat(categories): [WMS-505] complete categories migrations
- File: `modules/users/backend/src/repositories/EndUserInvitationRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
Hard-coded filters mixed with options — e.g. `eq(users.is_super, 0)` and `isInternal` flags tied to deprecated schema columns (`02a2b17a` removed them).

## After (accepted / fixed)
Accumulate conditions only when option is present:

```typescript
const conditions: SQL[] = [isNull(users.deletedAt)];
if (typeof options.active === 'boolean') {
  conditions.push(eq(users.active, options.active));
}
if (options.organizationId) {
  conditions.push(sql`EXISTS (...)`);
}
if (options.email?.trim()) {
  conditions.push(like(users.email, `%${escapeSqlServerLikeWildcards(options.email.trim())}%`));
}
const whereClause = and(...conditions);
```

Empty `inArray` inputs short-circuit:

```typescript
if (deptIds.length === 0) return [];
```

Boolean filters use `typeof x === 'boolean'` so `false` is not treated as absent.

## Why it matters
Optional filters must not use truthy checks on booleans or empty strings. Early return on empty batch inputs avoids invalid `IN ()` SQL.

## Skill candidate tag
filter-edge-cases

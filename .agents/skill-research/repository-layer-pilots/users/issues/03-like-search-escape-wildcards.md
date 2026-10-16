# Escape SQL Server LIKE wildcards in search filters

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `6480dfc4` — feat: add external + internal services and routes, unifing error handling logic
- File: `modules/users/backend/src/repositories/OrganizationRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
No text search on paginated user lists; org search not yet present.

## After (accepted / fixed)
All user-facing search terms pass through shared escaper before wrapping in `%`:

```typescript
import { escapeSqlServerLikeWildcards } from '@wfe/shared-lib';

if (options.search?.trim()) {
  const literal = escapeSqlServerLikeWildcards(options.search.trim());
  const like$ = `%${literal}%`;
  const searchClause = or(
    like(users.email, like$),
    like(users.first_name, like$),
    like(users.last_name, like$),
    like(users.phone, like$)
  );
  if (searchClause) conditions.push(searchClause);
}
```

Per-field filters (`email`, `firstName`, `lastName`) added later (`47a887b8`) use the same escaper.

## Why it matters
Unescaped `%` and `_` in user input broaden LIKE matches unexpectedly — a security/correctness issue on admin search endpoints.

## Skill candidate tag
like-search

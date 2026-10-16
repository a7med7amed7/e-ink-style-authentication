# Offset pagination: shared WHERE, count query, then fetch

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `6480dfc4` — feat: add external + internal services and routes, unifing error handling logic
- Commit: `69f0bb70` — fix(users): [WMS-295] user bugs
- File: `modules/users/backend/src/repositories/OrganizationRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
`findAll` used optional `skip`/`take` with a sentinel `fetch(2147483647)` when only skip provided — awkward but accepted for non-paginated lists. Paginated admin UI had no dedicated method.

## After (accepted / fixed)
Standard paginated shape:

```typescript
const page = options.page && options.page > 0 ? options.page : 1;
const size = options.size && options.size > 0 ? options.size : 20;
const skip = (page - 1) * size;

const whereClause = and(...conditions);

const [totalRow] = await this.db.select({ n: count() }).from(users).where(whereClause);
const total = Number(totalRow?.n ?? 0);

const rows = await this.db
  .select({ ...userColsPublic, Category: { ... } })
  .from(users)
  .leftJoin(...)
  .where(whereClause)
  .orderBy(buildUsersOrderBy(options.sortField, options.sortOrder))
  .offset(skip)
  .fetch(size);

return { data, total, page, size };
```

Dynamic sort whitelist added (`69f0bb70`). Org repo uses `pageSize` naming but same pattern.

## Why it matters
Count and data queries must share identical filters. Page defaults prevent divide-by-zero and negative offsets. MSSQL uses `.offset().fetch()` not `LIMIT`.

## Skill candidate tag
cursor-pagination

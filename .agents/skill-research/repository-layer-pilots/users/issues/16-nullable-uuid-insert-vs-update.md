# Nullable UUID: `undefined` on insert, `sql\`NULL\`` on update

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/OrganizationRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories
- File: `modules/users/backend/src/repositories/DepartmentRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories
- File: `modules/users/backend/src/repositories/DepartmentUserRepository.ts`
- Commit: `9b538699` — feat(users): [WMS-368] create and edit unifing

## Before (rejected / buggy)
Passing `null` directly to Drizzle UUID columns on insert caused type/runtime issues.

## After (accepted / fixed)
**Insert** — omit nullable FKs with `undefined`:

```typescript
category_id: input.category_id ?? undefined,
parent_department_id: input.parent_department_id ?? undefined,
reports_to_id: input.reports_to_id ?? undefined,
```

**Update** — distinguish “not provided” from “set to null”:

```typescript
category_id: patch.category_id !== undefined ? (patch.category_id ?? sql`NULL`) : undefined,
reports_to_id: reportsToId !== null ? reportsToId : sql`NULL`,
```

Inline comments document: `// null → undefined: Drizzle UUID column type doesn't accept null in inserts`.

## Why it matters
Drizzle MSSQL UUID columns treat insert and update nullability differently. Skill must codify the insert/update split to avoid silent skip vs constraint errors.

## Skill candidate tag
uuid-typing

# DB-owned timestamps via SQL expressions

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/LanguageRepository.ts`, `modules/languages/backend/src/db/schema.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Aligns with monorepo checklist: prefer database defaults over app-set `createdAt`/`updatedAt`. Anti-pattern avoided: `updatedAt: new Date()` in Node (clock skew, inconsistent with SQL `CURRENT_TIMESTAMP` defaults).

## After (accepted / fixed)
Schema defaults:

```typescript
updatedAt: c.datetime2('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`)
```

Repository mutations set `updatedAt` via SQL, not JS `Date`:

```typescript
.set({
  isActive: false,
  updatedAt: sql`CURRENT_TIMESTAMP`,
})
```

Insert paths omit `createdAt`/`updatedAt` to let defaults apply.

## Why it matters
Single source of truth for write timestamps is the database server clock. Repository code only touches `updatedAt` on explicit updates, not on every read path.

## Skill candidate tag
timestamps-soft-delete

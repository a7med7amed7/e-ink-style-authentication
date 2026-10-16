# UUID column helpers: PK vs non-PK FK typing

## Service
files

## Evidence
- File: `modules/files/backend/src/db/schema.ts`
- Commit: `097bce29` — `feat(file): [WMS-346] File service initial setup - Fixing duo reviews v3` (`uploadedById: varchar` → `mssqlUuidPrimaryKey` — wrong helper)
- Commit: `8489ed28` — `feat(file): [WMS-346] File service initial setup - Fixing duo reviews v4` (`mssqlUuidPrimaryKey` → `mssqlUuid` for FK)
- Related: thumbnail FKs in `8bbdb581` correctly use `mssqlUuid('file_id')` / `mssqlUuid('resolution_id')` with `mssqlUuidPrimaryKey` only on row PKs

## Before (rejected / buggy)
```typescript
// v3 review iteration — FK column incorrectly used primary-key helper
uploadedById: mssqlUuidPrimaryKey('uploaded_by_id').notNull(),
```
Earlier still used plain `c.varchar('uploaded_by_id', { length: 36 })`, inconsistent with monorepo UUID column types.

## After (accepted / fixed)
```typescript
id: mssqlUuidPrimaryKey('id').notNull().default(mssqlNewSequentialIdDefault),
uploadedById: mssqlUuid('uploaded_by_id').notNull(),
// file_thumbnails:
fileId: mssqlUuid('file_id').notNull(),
resolutionId: mssqlUuid('resolution_id').notNull(),
```

## Why it matters
`mssqlUuidPrimaryKey` implies PK semantics/constraints; non-key UUID columns must use `mssqlUuid`. Getting this wrong at schema review time propagates into migrations and type inference.

## Skill candidate tag
uuid-typing

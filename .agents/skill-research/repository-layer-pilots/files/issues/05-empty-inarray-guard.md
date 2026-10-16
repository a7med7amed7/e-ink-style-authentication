# Guard empty arrays before inArray queries

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `507d453d` — `feat(file): [WMS-346] File service initial setup`
- Related: `16359082` — `hasMismatchedTag` returns `false` when `fileIds.length === 0`; `isUserAuthorized` returns `true` for empty list

## Before (rejected / buggy)
Passing `inArray(column, [])` can produce invalid SQL (`IN ()`) or unexpected empty/error behavior depending on the driver.

## After (accepted / fixed)
```typescript
async findByIds(ids: string[], includeDeleted = false): Promise<File[]> {
  if (ids.length === 0) return [];
  // ...
}

async promoteFiles(fileIds: string[], tx?: FilesDbOrTx): Promise<File[]> {
  if (fileIds.length === 0) return [];
  // ...
}

async softDeleteFiles(fileIds: string[], tx?: FilesDbOrTx): Promise<File[]> {
  if (fileIds.length === 0) return [];
  // ...
}
```

Auth helpers choose a safe boolean for the empty case (`true` for “all authorized”, `false` for “has mismatch”) instead of hitting the DB.

## Why it matters
Batch APIs routinely receive empty ID lists. Guarding at the repository boundary avoids dialect pitfalls and keeps call sites simple.

## Skill candidate tag
filter-edge-cases

# Upsert via delete-then-insert to avoid unique violations

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/ThumbnailRepository.ts`
- Commit: `15ff6a33` — `feat(file): [WMS-451] Fixing security checks and issues`
- Related: schema `uniqueIndex('uq_file_thumbnails_file_resolution').on(t.fileId, t.resolutionId)` from `8bbdb581`; test renamed `insertThumbnail` → `upsertThumbnail` asserting `delete` then `insert`

## Before (rejected / buggy)
```typescript
async insertThumbnail(data: NewFileThumbnail): Promise<FileThumbnail> {
  const [row] = await this.db.insert(fileThumbnails).output().values(data);
  return row;
}
```
Re-generating a thumbnail for the same `(fileId, resolutionId)` hit the unique index and failed.

## After (accepted / fixed)
```typescript
async upsertThumbnail(data: NewFileThumbnail): Promise<FileThumbnail> {
  await this.db
    .delete(fileThumbnails)
    .where(
      and(
        eq(fileThumbnails.fileId, data.fileId),
        eq(fileThumbnails.resolutionId, data.resolutionId)
      )
    );
  const [row] = await this.db.insert(fileThumbnails).output().values(data);
  return row;
}
```

## Why it matters
Idempotent writes against a unique composite key must not assume first-insert-only. When the dialect/ORM lacks a clean `ON CONFLICT`/`MERGE` path, delete-by-key then insert is an accepted pattern — but callers should prefer wrapping both steps in a transaction (see debt in summary).

## Skill candidate tag
upsert-uniqueness

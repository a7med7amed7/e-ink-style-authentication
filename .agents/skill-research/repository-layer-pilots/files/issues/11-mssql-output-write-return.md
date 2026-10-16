# MSSQL write-return via `.output()`

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`, `ThumbnailRepository.ts`
- Commit: `507d453d` — `feat(file): [WMS-346] File service initial setup`
- Related: `8bbdb581` — thumbnail insert/delete use `.output()`; tests assert `output` called on create/update/upsert/delete

## Before (rejected / buggy)
Assuming Drizzle/Postgres-style `RETURNING` or reading `result[0]` from a bare insert without MSSQL `OUTPUT` leaves the caller without the persisted row (DB-generated UUID, defaults).

## After (accepted / fixed)
```typescript
const [file] = await dbToUse.insert(files).output().values(data);
return file;

const [updatedFile] = await dbToUse
  .update(files)
  .set(updateData)
  .where(eq(files.id, id))
  .output();

const deleted = await this.db
  .delete(fileThumbnails)
  .where(eq(fileThumbnails.fileId, fileId))
  .output();
```

Missing update row → throw domain `FileNotFoundError` (message clarified in `2ec78eeb`).

## Why it matters
On MSSQL, `.output()` is the reliable way to return inserted/updated/deleted rows so services can continue without a follow-up SELECT.

## Skill candidate tag
write-return

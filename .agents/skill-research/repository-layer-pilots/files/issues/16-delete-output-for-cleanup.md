# Delete `.output()` returns rows for compensating cleanup

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/ThumbnailRepository.ts`
- Commit: `8bbdb581` — `feat(file): [WMS-451] Setting up and initializing the db schemas, repos, and migrations`
- Related: class docblock — “returns the deleted rows so the service can delete the corresponding storage objects (no orphaned blobs)”; test asserts returned provider keys

## Before (rejected / buggy)
Hard-deleting thumbnail rows without returning `providerKey` / storage metadata forces a SELECT-before-DELETE race, or leaves blob orphans if the service never saw the keys.

## After (accepted / fixed)
```typescript
async deleteByFileId(fileId: string): Promise<FileThumbnail[]> {
  const deleted = await this.db
    .delete(fileThumbnails)
    .where(eq(fileThumbnails.fileId, fileId))
    .output();
  return deleted;
}
```

## Why it matters
When DB rows point at external blobs, the repository should return enough of the deleted row for the service to perform compensating storage deletes in the same flow.

## Skill candidate tag
write-return

# Expiry cleanup queries: status + expiresAt + soft-delete

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `507d453d` — `feat(file): [WMS-346] File service initial setup`
- Related: schema index `idx_files_status_cleanup` on `(status, expiresAt)`; expiry/metadata fixes `cbf52c63` / `715bedc2` ensure `expiresAt` can be set/cleared on upload completion; `promoteFiles` nulls `expiresAt`

## Before (rejected / buggy)
Cleanup that only checks `expiresAt < now()` without status/soft-delete can expire AVAILABLE files or re-process already deleted rows. Missing index on `(status, expiresAt)` makes periodic sweeps expensive.

## After (accepted / fixed)
```typescript
async findExpiredPendingFiles(): Promise<File[]> {
  return await this.db
    .select()
    .from(files)
    .where(
      and(
        eq(files.status, FileStatus.PENDING),
        lt(files.expiresAt, new Date()),
        isNull(files.deletedAt)
      )
    );
}

// Parallel findExpiredStagedFiles with FileStatus.STAGED
```

## Why it matters
Lifecycle cleanup is a reusable repository pattern: constrain by lifecycle state, time threshold, and soft-delete, and back it with a composite index matching the predicate.

## Skill candidate tag
filter-edge-cases

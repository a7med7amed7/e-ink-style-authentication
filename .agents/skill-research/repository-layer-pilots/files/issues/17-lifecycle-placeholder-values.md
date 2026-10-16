# Descriptive placeholders for incomplete lifecycle rows

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `cf03e71d` — `feat(log): [WMS-353] Fixing Security Issues`
- Related: 2-phase upload lifecycle `22423fd7`; `createPendingFile` later accepts `tag` in `7b84d191`

## Before (rejected / buggy)
```typescript
originalName: 'pending',
mimeType: 'application/octet-stream',
storageProvider: 'local',
```
Sentinel values look like real files (`application/octet-stream` + `local` storage) and can confuse scanning, metrics, or accidental serving of incomplete uploads.

## After (accepted / fixed)
```typescript
originalName: '<upload-in-progress>',
mimeType: 'application/pending-upload',
originalSize: 0,
storedSize: 0,
storageProvider: 'pending',
status: FileStatus.PENDING,
```

Real metadata is written later via `updateFileMetadata` when the upload completes.

## Why it matters
NOT NULL columns on incomplete entities need placeholders that cannot be mistaken for production data. Prefer explicit, invalid-looking sentinels over plausible defaults.

## Skill candidate tag
other:lifecycle-placeholders

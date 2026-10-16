# Optional tx parameter with FilesDbOrTx union

## Service
files

## Evidence
- File: `modules/files/backend/src/db/client.ts`, `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `507d453d` — `feat(file): [WMS-346] File service initial setup` (repo methods accept `tx?`)
- Related: `client.ts` type `FilesDbOrTx = FilesDb | Parameters<Parameters<FilesDb['transaction']>[0]>[0]` (stable; pool singleton lineage via `bdce5cb0` / shared client patterns)

## Before (rejected / buggy)
Repositories bound only to the root `db` cannot participate in a caller-owned transaction — multi-step upload lifecycle (create pending → update metadata → promote) cannot roll back as one unit.

## After (accepted / fixed)
```typescript
// db/client.ts
export type FilesDb = typeof db;
export type FilesDbOrTx = FilesDb | Parameters<Parameters<FilesDb['transaction']>[0]>[0];

// FileRepository write methods
async create(data: NewFile, tx?: FilesDbOrTx): Promise<File> {
  const dbToUse = tx || this.db;
  const [file] = await dbToUse.insert(files).output().values(data);
  return file;
}
```

Same `tx || this.db` pattern on `updateStatus`, `promoteFiles`, `softDeleteFiles`, `updateFileMetadata`.

## Why it matters
Upload and promotion flows need atomic multi-statement writes. Passing an optional transaction handle is the files-service convention (contrast languages’ `withTx()` clone — both valid).

## Skill candidate tag
transactions

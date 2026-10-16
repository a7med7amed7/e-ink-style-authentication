# Tag / tenant scoping enforced in SQL WHERE

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `16359082` — `feat(file): [WMS-388] Fixing security issues`
- Related: `7b84d191` — `feat(file): [WMS-388] Service Identity Check` (adds `tag` column + `createPendingFile({ tag? })`); schema index `idx_files_tag`; tests in `FileRepository.test.ts` (`hasMismatchedTag`)

## Before (rejected / buggy)
Service identity (caller tag) was not checked at the repository layer. A caller could operate on file IDs belonging to another service tag after only application-layer assumptions — no SQL predicate rejected cross-tag access.

## After (accepted / fixed)
```typescript
async hasMismatchedTag(fileIds: string[], authenticatedTag: string): Promise<boolean> {
  if (fileIds.length === 0) return false;

  const mismatchedFiles = await this.db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        inArray(files.id, fileIds),
        isNull(files.deletedAt),
        isNotNull(files.tag),
        not(eq(files.tag, authenticatedTag))
      )
    );

  return mismatchedFiles.length > 0;
}
```

Nullable-tag semantics: only rows with a non-null tag that differs from the authenticated tag count as mismatches (untagged rows are not treated as cross-tenant).

## Why it matters
Authorization boundaries that live only in HTTP/service code are easy to miss on batch paths. Pushing tenant/tag mismatch into a single SQL predicate keeps every multi-ID operation consistent and indexable (`idx_files_tag`).

## Skill candidate tag
authz-in-sql

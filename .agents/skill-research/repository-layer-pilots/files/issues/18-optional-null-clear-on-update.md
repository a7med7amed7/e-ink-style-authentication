# Optional nullable fields on update via spread (including clear-to-null)

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `cbf52c63` — `feat(log): [WMS-353] Fixing Bugs related to expiry and scanning` (adds `expiresAt?: Date | null`)
- Commit: `715bedc2` — `feat(log): [WMS-353] Fixing Bugs related to expiry and scanning v2` (removes redundant `if (expiresAt !== undefined)` — spread already applies)

## Before (rejected / buggy)
`updateFileMetadata` could not set/clear `expiresAt` after upload. An intermediate attempt re-assigned `expiresAt` only inside an `if (!== undefined)` block that duplicated the spread — noise, easy to drift.

## After (accepted / fixed)
```typescript
metadata: {
  // ...
  expiresAt?: Date | null;
},

const updateData: Partial<File> = {
  ...metadata,
  updatedAt: new Date(),
};
// Note: expiresAt is already handled by the spread operator above
```

Callers pass `expiresAt: null` to clear, a `Date` to set, or omit to leave unchanged only if they build a partial object without the key (here the typed object usually includes only provided fields from the service).

## Why it matters
Repository update DTOs should allow explicit `null` to clear nullable columns. Prefer one spread into `.set()` over duplicated conditional copies of the same field.

## Skill candidate tag
filter-edge-cases

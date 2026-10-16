# Narrow select projection for authz / existence checks

## Service
files

## Evidence
- File: `modules/files/backend/src/repositories/FileRepository.ts`
- Commit: `507d453d` — `feat(file): [WMS-346] File service initial setup` (`isUserAuthorized`)
- Related: `16359082` — `hasMismatchedTag` also uses `.select({ id: files.id })`

## Before (rejected / buggy)
```typescript
// Hypothetical / antipattern: select() returns full file rows
// including providerKey, originalName, sizes — unnecessary for a boolean authz check
.select()
.from(files)
```

## After (accepted / fixed)
```typescript
.select({ id: files.id })
.from(files)
.where(/* ownership or tag mismatch predicates */)
```

Full-row `.select()` remains on entity-fetch methods (`findById`, `findByIds`); boolean helpers project only what they need.

## Why it matters
Authz helpers should not pull storage keys or PII-adjacent metadata. Narrow projection reduces payload size and makes intent obvious: “I only need to know which IDs match.”

## Skill candidate tag
select-projection

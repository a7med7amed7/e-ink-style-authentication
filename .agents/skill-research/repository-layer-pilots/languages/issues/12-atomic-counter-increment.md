# Atomic counter increment in SQL

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/TranslationVersionRepository.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: read `versionCounter`, increment in application memory, write back — race condition under concurrent imports.

## After (accepted / fixed)
Single UPDATE with SQL expression and `.output()`:

```typescript
const [row] = await this.db
  .update(platformLanguages)
  .set({ versionCounter: sql`${platformLanguages.versionCounter} + 1` })
  .output()
  .where(eq(platformLanguages.languageId, languageId));

if (!row) throw new Error('Failed to allocate translation version number');
return row.versionCounter;
```

Counter lives on parent aggregate row (`platformLanguages.versionCounter`); versions table stores assigned numbers with a unique `(languageId, versionNumber)` index.

## Why it matters
Monotonic sequence allocation must be atomic at the database. SQL increment + unique constraint is the standard pattern when UUID v7/sequential IDs are not used for version numbers.

## Skill candidate tag
other:atomic-counter

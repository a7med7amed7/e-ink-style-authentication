# MSSQL write-return via Drizzle .output()

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/LanguageRepository.ts`, `TranslationVersionRepository.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: insert without returning generated keys/defaults, then issuing a second SELECT (race-prone, slower).

## After (accepted / fixed)
Use `.output()` on insert and counter update to read SQL Server `OUTPUT` clause results:

```typescript
const [inserted] = await tx.insert(platformLanguages).output().values({ ... });
if (!inserted) throw new Error('Failed to create platform language');
languageId = inserted.languageId;

// Atomic counter:
const [row] = await this.db
  .update(platformLanguages)
  .set({ versionCounter: sql`${platformLanguages.versionCounter} + 1` })
  .output()
  .where(eq(platformLanguages.languageId, languageId));
return row.versionCounter;
```

## Why it matters
MSSQL does not support `RETURNING` like PostgreSQL; `OUTPUT` is the idiomatic way to get server-generated UUIDs and incremented counters in one round-trip.

## Skill candidate tag
write-return

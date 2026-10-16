# Conditional batch insert when junction list may be empty

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/LanguageRepository.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: unconditional `insert().values([])` after delete-all junction rows — invalid or no-op depending on ORM.

## After (accepted / fixed)
Replace-all junction pattern with guarded insert:

```typescript
await tx.delete(languageCountries).where(eq(languageCountries.languageId, languageId));

if (input.countryIds.length > 0) {
  await tx.insert(languageCountries).values(
    input.countryIds.map((countryId) => ({
      languageId,
      countryId,
      languageCode: input.languageCode,
      languageName: input.languageName,
      defaultPriority: previousPriorities.get(countryId) ?? null,
    }))
  );
}
```

Delete always runs (clear stale mappings); insert only when there are IDs.

## Why it matters
Many-to-many sync operations are "delete all for parent, then re-insert." The empty-list case must be valid (parent with zero children). Guard keeps the ORM from generating bad SQL.

## Skill candidate tag
filter-edge-cases

# Clear-then-reassign for nullable unique priority columns

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/CountryRepository.ts`, `modules/languages/backend/src/db/schema.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: updating priorities in place (1→2, 2→1) under a unique index on `(countryId, defaultPriority) WHERE default_priority IS NOT NULL`, causing transient unique violations.

## After (accepted / fixed)
`replaceDefaultLanguagesForCountry` inside a transaction:

1. Null out all priorities for the country.
2. Assign new priorities sequentially.

```typescript
await tx.update(languageCountries)
  .set({ defaultPriority: null })
  .where(eq(languageCountries.countryId, countryId));

for (const [index, languageId] of languageIdsInPriorityOrder.entries()) {
  await tx.update(languageCountries)
    .set({ defaultPriority: index + 1 })
    .where(and(
      eq(languageCountries.countryId, countryId),
      eq(languageCountries.languageId, languageId)
    ));
}
```

Reads use `isNotNull(languageCountries.defaultPriority)` to exclude unassigned mappings.

## Why it matters
Filtered/partial unique indexes on nullable ordering columns require a two-phase write. This pattern generalizes to any "ranked slot" junction table.

## Skill candidate tag
upsert-uniqueness

# Batch related-entity fetch to avoid N+1

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/LanguageRepository.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: looping `listActiveLanguages` rows and calling `findCountriesByLanguageId` per row (1 + N queries).

## After (accepted / fixed)
1. Fetch parent rows in one query.
2. Collect IDs; short-circuit if empty.
3. Batch-load children with `inArray` in parallel:

```typescript
const languageIds = rows.map((row) => row.languageId);
const [countriesByLanguage, draftLanguageIds] = await Promise.all([
  this.findCountriesByLanguageIds(languageIds),
  this.findLanguageIdsWithDraft(languageIds),
]);

return rows.map((row) =>
  rowToDto(
    row,
    countriesByLanguage.get(row.languageId) ?? [],
    draftLanguageIds.has(row.languageId)
  )
);
```

`findCountriesByLanguageIds` groups results into a `Map<string, Dto[]>` in a single pass.

## Why it matters
List endpoints are the most common N+1 source. Two batch queries plus in-memory join scales linearly with result size instead of query count.

## Skill candidate tag
batching-n1

# Explicit select projection on joins

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/LanguageRepository.ts`, `CountryRepository.ts`, `TranslationVersionRepository.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: `select().from(a).innerJoin(b)` returning wide rows with ambiguous/over-fetched columns and leaking internal schema shapes to callers.

## After (accepted / fixed)
Join queries name only needed columns in the projection object:

```typescript
.select({
  languageId: platformLanguages.languageId,
  languageCode: languageCatalog.languageCode,
  languageName: languageCatalog.languageName,
  // ...
})
.from(platformLanguages)
.innerJoin(languageCatalog, eq(languageCatalog.catalogId, platformLanguages.catalogId))
```

List/read helpers map to DTOs via dedicated mappers (`rowToDto`, `toRecord`). Full `select()` is reserved for simple single-table lookups (`findCatalogById`).

## Why it matters
Explicit projections document the repository contract, reduce payload size, and prevent accidental dependency on columns not in the DTO layer.

## Skill candidate tag
select-projection

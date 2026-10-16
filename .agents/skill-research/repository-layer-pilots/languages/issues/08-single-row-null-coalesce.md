# Single-row optional result with destructuring and null coalesce

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/LanguageRepository.ts`, `CountryRepository.ts`, `TranslationVersionRepository.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: returning `rows[0]` without handling empty arrays (undefined leaks to callers) or throwing when "not found" is a normal outcome.

## After (accepted / fixed)
Consistent optional-single-row idiom:

```typescript
const [row] = await this.db.select(...).where(...);
return row ?? null;
```

Used for `findCatalogById`, `findActiveCountryByCode`, `findByLanguageAndNumber`, etc. Callers branch on `null` instead of catching errors.

## Why it matters
Makes "not found" explicit in the type system (`T | null`). Destructuring first element avoids indexing noise and pairs naturally with Drizzle's array return type.

## Skill candidate tag
filter-edge-cases

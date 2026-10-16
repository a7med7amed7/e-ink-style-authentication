# Empty-array guard before inArray queries

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/LanguageRepository.ts`, `CountryRepository.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: passing `inArray(column, [])` which can produce invalid SQL (`IN ()`) or full-table scans depending on driver/ORM behavior.

## After (accepted / fixed)
Early return with empty collection when input array is empty:

```typescript
// LanguageRepository.findCountriesByLanguageIds
if (!languageIds.length) return new Map();

// LanguageRepository.findLanguageIdsWithDraft
if (!languageIds.length) return new Set();

// CountryRepository.findActiveCountriesByCodes
if (!normalized.length) return [];
```

## Why it matters
Batch helpers are often called with zero IDs after filtering parent rows. Guarding at the repository boundary prevents runtime SQL errors and unnecessary round-trips.

## Skill candidate tag
filter-edge-cases

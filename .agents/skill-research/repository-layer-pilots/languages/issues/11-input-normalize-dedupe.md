# Input normalization and deduplication before lookup

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/CountryRepository.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: case-sensitive code matching (`us` vs `US`) and duplicate codes in `inArray` producing redundant SQL parameters.

## After (accepted / fixed)
Normalize at repository boundary before query:

```typescript
// Single lookup
const normalized = countryCode.trim().toUpperCase();

// Batch lookup
const normalized = [...new Set(countryCodes.map((code) => code.trim().toUpperCase()))];
if (!normalized.length) return [];
```

## Why it matters
Natural keys (country codes, SKU codes, slug codes) should be canonicalized once at the persistence boundary so callers cannot accidentally miss matches due to whitespace or casing.

## Skill candidate tag
filter-edge-cases

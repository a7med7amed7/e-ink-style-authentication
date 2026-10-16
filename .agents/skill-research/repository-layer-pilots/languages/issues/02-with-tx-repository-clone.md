# withTx() repository clone for nested transactional calls

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/LanguageRepository.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: calling `this.findRowWithCatalogById()` inside a transaction while `this.db` still points at the root client, causing reads/writes outside the transaction boundary.

## After (accepted / fixed)
Private factory clones the repository bound to the active transaction handle:

```typescript
private withTx(tx: LanguagesDbOrTx): LanguageRepository {
  return new LanguageRepository(tx);
}

const run = async (tx: LanguagesDbOrTx) => {
  const repo = this.withTx(tx);
  const row = await repo.findRowWithCatalogById(languageId);
  // ...
};
```

`CountryRepository` uses the same pattern inline: `new CountryRepository(tx).listDefaultLanguagesForCountry(countryId)`.

## Why it matters
When a method orchestrates multiple repository calls in one transaction, every delegated read/write must use the same `tx`. Cloning via constructor is simpler than threading optional `tx?` through every method signature (alternative used in users/files modules).

## Skill candidate tag
transactions

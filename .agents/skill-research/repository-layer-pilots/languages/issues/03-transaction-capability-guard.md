# Transaction capability guard (auto-wrap vs participate)

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/LanguageRepository.ts`, `CountryRepository.ts`, `TranslationVersionRepository.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-patterns avoided:
- Always calling `.transaction()`, nesting transactions when already inside one.
- Never wrapping, leaving multi-step writes non-atomic when called from a route handler.

## After (accepted / fixed)
Multi-step methods extract inner `run(tx)` and branch on whether `this.db` is the root client:

```typescript
if ('transaction' in this.db) {
  return this.db.transaction(async (tx) => run(tx));
}
return run(this.db);
```

When constructed with a tx handle (no `.transaction` method), `run` executes directly — enabling participation in an outer transaction started by a service or parent repo method.

## Why it matters
One method is safe both as a top-level entry point and as a nested step. Callers do not need to know whether they must pre-open a transaction. Nested calls like `upsertActiveLanguage` → `clearDraftVersions` rely on the inner method seeing a tx-only handle.

## Skill candidate tag
transactions

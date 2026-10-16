# Active-flag lifecycle instead of hard delete

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/LanguageRepository.ts`, `CountryRepository.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: `DELETE FROM platform_languages` cascading away published translation history needed for audit/rollback.

## After (accepted / fixed)
Reads filter on `isActive` (and sometimes `isPublished`):

```typescript
.where(and(eq(countries.id, countryId), eq(countries.isActive, true)))

async findActiveById(languageId: string) {
  const row = await this.findRowWithCatalogById(languageId);
  if (!row || !row.isActive) return null;
  // ...
}
```

`deactivateLanguage` sets `isActive: false` after `clearDraftVersions` — comment notes published/archived history is retained. `upsertActiveLanguage` reactivates via `isActive: true` update, not re-insert.

## Why it matters
Soft lifecycle preserves referential history and supports reactivation flows. Repository queries consistently enforce the active contract so inactive rows do not surface in admin/public read paths.

## Skill candidate tag
timestamps-soft-delete

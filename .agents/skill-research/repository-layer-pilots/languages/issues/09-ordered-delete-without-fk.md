# Ordered deletes when FK does not enforce child order

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/LanguageRepository.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: deleting parent `translation_versions` rows first while `translation_payloads` rows still reference them by `(languageCode, versionNumber)` without a formal FK — leaving orphans or causing constraint errors if FK is added later.

## After (accepted / fixed)
`deleteDraftVersionsAndPayloads` documents and enforces order:

```typescript
// No FK from payloads → versions, but clear draft payloads before deleting versions.
await tx.delete(translationPayloads).where(
  and(
    eq(translationPayloads.languageCode, languageCode),
    inArray(translationPayloads.versionNumber, draftVersionNumbers)
  )
);

await tx.delete(translationVersions).where(
  and(eq(translationVersions.languageId, languageId), eq(translationVersions.status, 'draft'))
);
```

Early exit when no draft versions exist avoids empty `inArray` on version numbers.

## Why it matters
Logical associations without DB FKs still require explicit delete ordering in repository code. Comments in the method encode the invariant for future schema changes.

## Skill candidate tag
other:ordered-delete

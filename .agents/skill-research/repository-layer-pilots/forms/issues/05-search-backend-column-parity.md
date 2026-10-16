# Dual search backends must scan the same columns

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/modules/sub-form/infrastructure/sub-form-list-search.ts`
- File: `platform/backend/services/forms/src/modules/form/infrastructure/form.repository.ts`
- File: `platform/backend/services/forms/src/modules/sub-form/__tests__/sub-form-list-search.test.ts`
- Commit: `d02739e3` — `feat(localization): [WMS-462] Enhancing shared code and fixing drizzle FTS issue`

## Before (rejected / buggy)
FTS path searched `[name],[description]` via `CONTAINSTABLE`, while the LIKE/OPENJSON fallback only searched the name column. Disabling FTS or failing term sanitization produced a **different result set** than FTS for the same user query.

## After (accepted / fixed)
LIKE fallback accepts an optional `descriptionColumn` and OR-matches name + non-null description with the same locale filters. Call sites pass description for forms, sub-forms, and templates. Tests assert OPENJSON+LIKE covers both columns and still uses `ESCAPE`.

## Why it matters
Any repository with a primary search engine and a fallback (FTS ↔ LIKE, ES ↔ SQL, etc.) must treat column coverage as one contract. Feature flags or term sanitization must not silently shrink the searchable surface.

## Skill candidate tag
search-parity

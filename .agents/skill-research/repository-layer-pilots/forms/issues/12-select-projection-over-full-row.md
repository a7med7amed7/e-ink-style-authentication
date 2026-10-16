# Prefer select projections and join-shaped list rows

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/modules/sub-form/infrastructure/sub-form.repository.ts`
- Commit: `5aea58ea` — `listVersions` projects summary columns; `findActiveVersion` uses join instead of two round-trips
- Commit: `14fad389` / `bddb6cf8` — `feat(forms): [WMS-422] enrich sub-form list with active version metadata`

## Before (rejected / buggy)
- `listVersions`: `select()` full version rows (including large `json_object`) for summary UIs.
- `findActiveVersion`: load head, then second query by `active_version_id`.
- `listByCursor`: `select()` head only; services needed extra queries for active version metadata.

## After (accepted / fixed)
- Summary select: `{ id, version, created_by, createdAt }`.
- Active version via `innerJoin` in one query.
- List rows shaped as `{ head, activeVersion }` via `leftJoin` + map, typed as `SubFormListQueryRow`.
- Linked forms: select `{ id, name }` with `isNull(forms.deletedAt)` instead of id-only then hydrate.

## Why it matters
Repositories should return the shape the API needs and avoid selecting large JSON payloads or chaining per-row lookups. Projection + join is the default for list/detail enrichment on MSSQL/Drizzle.

## Skill candidate tag
select-projection

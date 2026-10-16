# Languages Module — Repository Layer Git History Summary

## Scope

| File | Commits (`--follow`) | Notes |
|------|---------------------|-------|
| `modules/languages/backend/src/repositories/LanguageRepository.ts` | 1 | Introduced mature |
| `modules/languages/backend/src/repositories/CountryRepository.ts` | 1 | Introduced mature |
| `modules/languages/backend/src/repositories/TranslationVersionRepository.ts` | 1 | Introduced mature |
| `modules/languages/backend/src/repositories/__tests__/LanguageRepository.test.ts` | 1 | Introduced with repo |
| `modules/languages/backend/src/db/client.ts` | 1 | Db client + `DbOrTx` type |

**Single commit across all files:** `9a364675` — `feat(languages): [WMS-460] add languages microservice` (2026-07-15, Mai Yasser)

No later fix commits touch the repository layer. All patterns below are **baked-in at creation** — evidence tagged `initial-design` in issue files. This module was scaffolded with conventions already learned elsewhere in the monorepo (compare `CommentRepository` for identical `withTx` / `'transaction' in this.db` patterns).

## Themes

1. **Transaction composability** — `LanguagesDbOrTx` union, `withTx()` clone, `'transaction' in this.db` guard so methods work standalone or inside a caller's transaction.
2. **Batching & N+1 avoidance** — `inArray` batch lookups; list endpoints fetch parent rows then batch-load children in `Promise.all`.
3. **Edge-case guards** — empty-array early returns before `inArray`; conditional `values()` insert; single-row `?? null`; input normalize/dedupe.
4. **MSSQL/Drizzle specifics** — `.output()` on insert/update; `sql\`CURRENT_TIMESTAMP\`` for `updatedAt`; atomic `versionCounter` increment via SQL expression.
5. **Lifecycle without hard delete** — `isActive` flag filtering; deactivate clears drafts but retains published/archived history.
6. **Referential ordering without FK** — delete child payloads before parent versions when no FK enforces order.
7. **Nullable unique columns** — clear-all-then-reassign pattern for ordered priorities under a filtered unique index.
8. **Testability** — drizzle-shaped transaction mock asserts multi-step write order without live MSSQL.

## Correct Patterns (stable since `9a364675`)

| Pattern | Primary file(s) | Issue |
|---------|-----------------|-------|
| `DbOrTx` union type | `db/client.ts` | `01-db-or-tx-union-type.md` |
| `withTx()` repository clone | `LanguageRepository.ts` | `02-with-tx-repository-clone.md` |
| Transaction capability guard | All three repos | `03-transaction-capability-guard.md` |
| Empty-array guard before `inArray` | `LanguageRepository.ts`, `CountryRepository.ts` | `04-empty-array-inarray-guard.md` |
| Batch child fetch (avoid N+1) | `LanguageRepository.ts` | `05-batch-related-entities-inarray.md` |
| Explicit select projection on joins | All three repos | `06-select-projection-joins.md` |
| MSSQL `.output()` write-return | `LanguageRepository.ts`, `TranslationVersionRepository.ts` | `07-mssql-output-write-return.md` |
| Single-row optional result | All three repos | `08-single-row-null-coalesce.md` |
| Ordered delete without FK | `LanguageRepository.ts` | `09-ordered-delete-without-fk.md` |
| Active-flag lifecycle (no hard delete) | `LanguageRepository.ts`, `CountryRepository.ts` | `10-active-flag-lifecycle.md` |
| Input normalize + dedupe | `CountryRepository.ts` | `11-input-normalize-dedupe.md` |
| Atomic SQL counter increment | `TranslationVersionRepository.ts` | `12-atomic-counter-increment.md` |
| DB-owned timestamps | `LanguageRepository.ts`, schema | `13-db-owned-timestamps.md` |
| Clear-then-reassign nullable uniques | `CountryRepository.ts` | `14-clear-then-reassign-priority.md` |
| Conditional batch insert guard | `LanguageRepository.ts` | `15-conditional-batch-insert.md` |
| Repository tx mock unit tests | `LanguageRepository.test.ts` | `16-repository-tx-mock-tests.md` |

## Debt / Observations

- **No post-launch repo fixes** — either very stable or changes happened only in services/routes (e.g. WMS-462 localization wiring did not touch repositories).
- **`listInactiveCatalogEntries`** filters `isActive !== true` in application code after a `leftJoin` instead of pushing predicate to SQL — minor; not a bug, but less efficient at scale.
- **`replaceDefaultLanguagesForCountry`** uses per-row updates in a loop inside a transaction — correct but could be batched if list grows large.
- **`upsertActiveLanguage` calls `clearDraftVersions` inside an outer transaction** — relies on nested `clearDraftVersions` detecting it is already on a tx (`'transaction' in this.db` is false for tx handle) — works by design; skill should document this interaction.
- **Two repository styles in monorepo** — languages uses constructor-injected `DbOrTx` + `withTx`; users/files use optional `tx?` parameter. Both valid; languages pattern is better for multi-statement atomic methods.

## Skill Candidates (ranked)

| Priority | Tag | Rationale |
|----------|-----|-----------|
| High | `transactions` | Full trio: type, `withTx`, capability guard — reusable across all Drizzle MSSQL services |
| High | `batching-n1` | List + batch children pattern with `inArray` and `Map` grouping |
| High | `filter-edge-cases` | Empty arrays, normalize/dedupe, conditional insert, `?? null` |
| High | `write-return` | MSSQL `.output()` on insert/update |
| Medium | `select-projection` | Named column maps on joins |
| Medium | `timestamps-soft-delete` | `isActive` lifecycle + `CURRENT_TIMESTAMP` in SQL |
| Medium | `upsert-uniqueness` | Clear-then-reassign for filtered unique nullable columns |
| Medium | `other:ordered-delete` | Child-before-parent when FK absent |
| Medium | `other:atomic-counter` | Single-statement counter allocation |
| Low | `other:repo-testing` | Tx mock pattern for multi-write assertions |

## Domain-Specific Excluded (not skill candidates)

- **Catalog vs platform language split** — product model (static catalog + per-tenant platform row), not a generic persistence technique.
- **Translation version status workflow** (`draft` / `published` / `archived`) — i18n domain state machine; archiving prior published version is domain logic.
- **Country default language fallback** — explicit priority list, else fall back to mapped published languages by catalog `sortOrder` — product rule for localization UX.
- **Denormalized `languageCode` / `languageName` on `language_countries`** — read optimization for country-default queries; technique is generic denormalization but tied to this schema.
- **Filtered unique index on `default_priority`** — schema design for "only one row per priority when assigned"; the *clear-then-reassign* write pattern is captured in issue 14; the index definition itself is domain-specific.
- **Publish instant alignment** (`updatedAt: publishedAt`) — intentional cross-field consistency for audit display; narrow product rule.
- **Junction replace preserving `previousPriorities` on upsert** — preserves admin-assigned defaults across country remapping; business rule.

## Files Produced

- `00-summary.md` (this file)
- `issues/01` … `issues/16` — one finding per transferable pattern

# Repository unit tests with drizzle-shaped transaction mock

## Service
languages

## Evidence
- File: `modules/languages/backend/src/repositories/__tests__/LanguageRepository.test.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: only integration tests against live MSSQL for multi-step write ordering; or mocking at too high a level to assert delete/update sequence.

## After (accepted / fixed)
`createTxMock` implements minimal drizzle chain (`select().from().where().orderBy()`, `update().set().where()`, `delete().where()`) routed by `getTableName(table)`.

Tests pass a fake root `db` with only `transaction: (fn) => fn(tx)` so repository uses the real transaction-capability guard path.

Assertions verify:
- Delete order: `translationPayloads` before `translationVersions`
- Platform row resets: `currentVersion: null`, `isPublished: false` without clearing `isActive` on draft-only clear
- No-op when language missing
- Reactivation clears leftover drafts when deactivate was skipped

## Why it matters
Complex repository methods with 3+ writes are testable without Docker MSSQL. Table-name routing keeps mocks maintainable when schema objects are refactored.

## Skill candidate tag
other:repo-testing

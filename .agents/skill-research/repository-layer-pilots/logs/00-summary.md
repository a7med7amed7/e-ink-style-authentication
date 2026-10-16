# Logs Service — Repository Layer Git History Research

Pilot service: `platform/backend/services/logs`  
Research date: 2026-07-21  
Method: `git log --oneline --follow` per file, then `git show` / `git log -p` on fix/review/refactor commits.

---

## 1. Files analyzed + commit counts

| File | Commits (`--follow`) | Notes |
|------|---------------------|-------|
| `src/repositories/AuditLogRepository.ts` | 9 | Richest evolution: pagination, filters, UUID, insert-return |
| `src/repositories/GatewayPlatformRepository.ts` | 2 | Created with offset pagination; one UUID typing fix |
| `src/repositories/index.ts` | 2 | Barrel export only; no meaningful repo-pattern evolution |
| `src/repositories/__tests__/AuditLogRepository.test.ts` | 4 | Integration + mock fallback; UUID test data; soft-delete coverage |
| `src/db/timestamps.ts` | 3 | Created at Drizzle migration; doc-path fix only after |
| `src/db/client.ts` | 2 | Created at Drizzle migration; dev pool singleton added |
| `src/db/schema.ts` | 11 | INT→UUID PK, NVARCHAR FK columns, indexes, shared-lib UUID helpers |

---

## 2. Themes ranked by recurrence

1. **UUID typing & migration** — PK and FK columns moved from `int` / `identity` to `uniqueidentifier` / `nvarchar(36)`; repo signatures and tests updated in lockstep (5+ commits).
2. **Cursor pagination (composite seek)** — `(createdAt, id)` predicate with direction-aware tie-break; `limit + 1` over-fetch; matching composite index (present from repo creation).
3. **LIKE search safety & semantics** — Wildcard escaping added after review; identifier prefix vs text contains split; CAST workaround for UUID prefix search (4 commits).
4. **Soft-delete read filters** — `isNull(deletedAt)` on every read path from day one; index re-added after accidental drop (stable pattern).
5. **MSSQL insert without RETURNING** — Client-side `randomUUID()` + explicit `id` in insert; abandoned broken `result[0]?.id` assumption (2 commits).
6. **Index design for query shapes** — Composite cursor index, covering indexes with manual `INCLUDE` in migration SQL (3 commits).
7. **Shared abstractions** — `@wfe/shared-lib` UUID column helpers; `@wfe/shared-schemas` filter types moved out of repo (2 commits).
8. **Input guards at repository boundary** — `findById` rejects empty/non-string IDs before hitting DB (2 repos).
9. **Timestamp helpers** — App-level `insertTimestamps()` alongside SQL `CURRENT_TIMESTAMP` defaults (stable from Drizzle adoption).
10. **Dev/test infrastructure** — Global connection-pool singleton; optional integration tests with mock fallback (3 commits).

---

## 3. Stabilized “correct” patterns (with pointers)

| Pattern | Where |
|---------|-------|
| Composite cursor seek: `(ts < cursor) OR (ts = cursor AND id < cursorId)` + `ORDER BY createdAt, id` + `.fetch(limit + 1)` | `AuditLogRepository.ts` — `findByResourceWithCursor` |
| Soft-delete on all reads: `isNull(table.deletedAt)` in `and(...)` | `AuditLogRepository.ts` — all find methods |
| Client-generated PK + `insertTimestamps()` on write | `AuditLogRepository.ts` — `create` |
| LIKE escape: `.replace(/[%_[\]]/g, '[$&]')` before interpolating user input | `AuditLogRepository.ts` — filter block |
| Identifier prefix (`${escaped}%`) vs text contains (`%${escaped}%`) | `AuditLogRepository.ts` — documented in filter comments |
| Full UUID → `eq`; partial UUID → `CAST(id AS NVARCHAR(36)) LIKE prefix%` | `AuditLogRepository.ts` — `filters.id` branch |
| `mssqlUuidPrimaryKey` + `mssqlNewSequentialIdDefault` from shared lib | `db/schema.ts` |
| Composite index `(resource, createdAt, id)` documented as backing cursor seek | `db/schema.ts` |
| Covering indexes declared in Drizzle; `INCLUDE (...)` hand-edited in `migration.sql` | `db/schema.ts` comments + migration folder |
| `insertTimestamps()` / `touchUpdatedAt()` helpers; schema SQL defaults | `db/timestamps.ts`, `db/schema.ts` |
| Dev pool reuse via `globalThis` | `db/client.ts` |
| `findById`: early `null` for falsy / non-string `id` | Both repositories |
| `findByIds([])` → `[]` without query | `AuditLogRepository.ts` |
| Integration tests skip gracefully when DB unavailable; mock path for CI | `__tests__/AuditLogRepository.test.ts` |

---

## 4. Remaining tech debt visible in current code

- **UUID prefix search uses CAST** — Documented TODO: prevents index use on `uniqueidentifier` PK; suggests computed `NVARCHAR(36)` column + index if hot path (`AuditLogRepository.ts` ~L95–98).
- **Gateway repo still uses offset pagination** — `GatewayPlatformRepository.findWithPagination` uses `offset`/`limit` + separate `count()`; no cursor pattern, no soft-delete column.
- **`touchUpdatedAt()` unused** — Helper exists but no update paths in repositories yet (`db/timestamps.ts`).
- **Full `select()` projection** — Repositories use `.select()` without column projection; acceptable for small rows but not optimized.
- **`GatewayPlatformRepository.create` sets `createdAt` inline** — Inconsistent with `insertTimestamps()` pattern used elsewhere.
- **Drizzle Kit INCLUDE fragility** — Regenerating migrations without manual `INCLUDE` append will silently drop covering columns (schema comments warn, but process risk remains).
- **`index.ts`** — Pure barrel; no patterns to mine.

---

## 5. Skill-candidate bullets (generic)

- **cursor-pagination**: Implement composite-key cursor seek `(sortCol, tieBreakId)` with direction-aware `OR` predicate, matching `ORDER BY`, `limit + 1` over-fetch, and a supporting composite index.
- **timestamps-soft-delete**: Apply `isNull(deletedAt)` on every read; pair SQL `CURRENT_TIMESTAMP` defaults with app `insertTimestamps()` on insert and `touchUpdatedAt()` on update.
- **write-return**: On MSSQL Drizzle, pre-generate UUID with `randomUUID()`, pass explicitly in `.values({ id, ... })`, return the client id — do not rely on insert return payload.
- **like-search**: Escape `%`, `_`, `[`, `]` before LIKE; use prefix match for identifiers, contains match for free text; document the split.
- **uuid-typing**: Migrate `int` FK columns to `nvarchar(36)` / `uniqueidentifier`; update repo method signatures and integration tests together; guard `findById` for non-string input.
- **other:mssql-include-indexes**: Declare key columns in Drizzle schema; hand-append `INCLUDE (...)` in `migration.sql` when Kit lacks support.
- **other:shared-schema-types**: Lift filter/DTO interfaces to a shared package instead of defining them inside the repository file.
- **other:drizzle-or-null-guard**: Assign `or(...)` to a variable and check truthiness before `filterConditions.push` — avoids pushing `undefined`.
- **other:connection-pool-singleton**: Reuse `ConnectionPool` on `globalThis` in non-production to survive hot reload / test re-runs.
- **other:optional-integration-tests**: Probe DB in `beforeAll`; skip integration `describe` when unavailable; provide mock-db unit tests for CI.
- **other:guard-empty-inarray**: Return `[]` early when `ids.length === 0` before calling `inArray`.

---

## Issue index

| # | File | Tag |
|---|------|-----|
| 01 | Composite cursor pagination | `cursor-pagination` |
| 02 | Soft-delete read filter | `timestamps-soft-delete` |
| 03 | Client-side UUID on insert | `write-return` |
| 04 | LIKE wildcard escaping | `like-search` |
| 05 | Prefix vs contains filter semantics | `like-search` |
| 06 | UUID prefix search via CAST | `uuid-typing` |
| 07 | Integer FK to string UUID migration | `uuid-typing` |
| 08 | findById input guards | `uuid-typing` |
| 09 | Shared UUID column helpers | `uuid-typing` |
| 10 | Covering indexes with manual INCLUDE | `other:mssql-include-indexes` |
| 11 | Filter types in shared-schemas | `other:shared-schema-types` |
| 12 | Drizzle or() null guard | `other:drizzle-or-null-guard` |
| 13 | App timestamp helpers | `timestamps-soft-delete` |
| 14 | Dev connection pool singleton | `other:connection-pool-singleton` |
| 15 | Empty inArray guard | `other:guard-empty-inarray` |
| 16 | Optional DB integration tests | `other:optional-integration-tests` |

# Users Repository Layer — Git History Mining Summary

**Service:** users  
**Scope:** `modules/users/backend/src/repositories/*`, `db/timestamps.ts`, `db/client.ts`  
**Method:** `git log --oneline --follow` per file; `git show` / `git log -p` for fix, review, security, pagination, UUID, approval-column, and soft-delete commits.

## Files and commit counts

| File | Commits |
|------|--------:|
| `UserRepository.ts` | 31 |
| `DepartmentRepository.ts` | 7 |
| `DepartmentUserRepository.ts` | 6 |
| `OrganizationRepository.ts` | 5 |
| `TempPasswordRepository.ts` | 4 |
| `EndUserInvitationRepository.ts` | 3 |
| `OtpRepository.ts` | 3 |
| `repositories/index.ts` | 3 |
| `db/client.ts` | 3 |
| `OrganizationRoleRepository.ts` | 2 |
| `BaseRepository.ts` | 2 |
| `db/timestamps.ts` | 2 |
| **Total** | **71** |

(`--follow` may count renames; UserRepository dominates history.)

## Ranked themes (by frequency and review churn)

1. **Timestamps & soft delete** — `insertTimestamps`, `touchUpdatedAt`, `softDeleteTimestamps`; `isNull(deletedAt)` on virtually every read; soft-delete writes bump `updatedAt`. Introduced in Prisma→Drizzle migration (`afce75f8`).
2. **Column projection** — `*ColsPublic` maps; password excluded unless `includePassword`; approval fields split into a second projection after review (`5c192847`, `9903e7e5`).
3. **Offset pagination** — `count()` + `offset(skip).fetch(size)`; page/size defaults; dynamic `orderBy` helper (`6480dfc4`, `69f0bb70`).
4. **LIKE search safety** — `escapeSqlServerLikeWildcards` before `%term%` patterns (`6480dfc4` onward).
5. **MSSQL write-return** — `.output()` on insert/update/delete for returned rows (`afce75f8`).
6. **UUID typing** — `number` IDs → `string` end-to-end (`2c180d90`); bulk lookup aligned for cross-service fan-out (`a5c70a14`).
7. **Batch / anti-N+1** — `inArray` bulk reads; `notInArray(subquery)` anti-joins; two-query tree assembly (`7c68dfbc`, `c5a63ac8`, `766ac28b`).
8. **Optional filter predicates** — conditions array built only when option present; `typeof x === 'boolean'` for booleans; empty-array early return (`766ac28b`, `47a887b8`).
9. **Transaction injection** — `tx?: UsersDbOrTx` with `const db = tx ?? this.db` (`5276a42d`, org repos `766ac28b`).
10. **Case-insensitive lookup** — two-step email resolve via `LOWER(LTRIM(RTRIM(CAST(...))))` (`afce75f8`).
11. **Workflow state in SQL** — `approval_status`, `is_verified`, `is_active` composed in repository WHERE clauses (`537e774c`, `5f4955aa`).
12. **Nullable UUID Drizzle quirks** — insert: `null → undefined`; update: `null → sql\`NULL\`` (`766ac28b`, `8442a85f`).
13. **Dead abstraction** — `BaseRepository` never extended after Drizzle migration (`afce75f8`).

## Correct patterns (accepted across reviews)

- Shared timestamp helpers + explicit `touchUpdatedAt()` on every update path (no ORM auto-hooks on MSSQL).
- Named public column projections reused via spread (`...userColsPublic`) instead of duplicated select lists.
- Sensitive columns (password, approval audit fields) kept off default list endpoints; dedicated methods/projections for admin flows.
- `escapeSqlServerLikeWildcards` on all user-facing search terms.
- Bulk ID lookup: dedupe + empty guard + single `inArray` query + soft-delete filter.
- Pagination: separate count query sharing the same `whereClause`.
- Optional `tx` parameter on write paths participating in service-level transactions.
- Left-join normalization: `Category?.id != null ? Category : null`.
- Subquery + `notInArray` for “available / unassigned” entity sets.
- `sql\`1 = 0\`` when a required filter is missing but the query must return nothing.
- Dev-only connection pool singleton on `globalThis` (`bdce5cb0`).

## Remaining debt / inconsistencies

- `BaseRepository.ts` is unused boilerplate — no subclass extends it.
- `UserRepository.update` uses `as any` for dynamic patches (eslint-disabled).
- `findExistingAssignment` intentionally skips `deletedAt` filter (monolith parity) — easy to misuse in new code.
- `OrganizationRoleRepository.bulkCreate` does not use `.output()` (fire-and-forget by design).
- `EndUserInvitationRepository` uses hard delete for pending rows; other entities use soft delete — mixed lifecycle model.
- JSDoc on `findManyByIds` still references numeric IDs in places (stale after UUID migration).
- `UserRepository.softDelete` does not filter `isNull(deletedAt)` on update WHERE (idempotent but differs from other methods).
- Verbose runtime ID validation with `console.warn` was added in review (`18cb82f2`) then dropped when UUID strings landed (`766ac28b`) — no documented team standard for bulk input sanitization.

## Skill candidates (tag → issue file)

| Tag | Issues |
|-----|--------|
| `timestamps-soft-delete` | 01, 22 |
| `select-projection` | 02, 17 |
| `like-search` | 03 |
| `write-return` | 04, 24 |
| `uuid-typing` | 05, 16 |
| `batching-n1` | 06, 14, 19 |
| `cursor-pagination` | 07 |
| `filter-edge-cases` | 08, 15, 20 |
| `dead-abstraction` | 09 |
| `transactions` | 10 |
| `other:case-insensitive-lookup` | 11 |
| `other:join-null-normalization` | 12 |
| `other:computed-display-codes` | 13 |
| `authz-in-sql` | 18 |
| `upsert-uniqueness` | 21 |
| `other:dev-pool-singleton` | 23 |

## Issue index

See `issues/` — 24 findings (`01`–`24`), ordered roughly by theme priority.

# Forms repository-layer pilot — summary

Feature-agnostic lessons mined from git history of the forms service Drizzle/MSSQL data-access layer. Localization product work is noted only where it produced transferable DB patterns; pure UX/domain changes are listed under **Domain-specific changes excluded**.

## 1. Files + commit counts

| File | Commits (`git log --oneline --follow`) |
|------|----------------------------------------|
| `modules/form/infrastructure/form.repository.ts` | 8 |
| `modules/sub-form/infrastructure/sub-form.repository.ts` | 14 |
| `modules/form-template/infrastructure/form-template.repository.ts` | 4 |
| `modules/sub-form-template/infrastructure/sub-form-template.repository.ts` | 11 |
| `modules/sub-form/infrastructure/sub-form-list-search.ts` | 4 |
| `modules/sub-form/infrastructure/resolved-name-sql.ts` | 2 |
| `modules/sub-form/domain/sub-form-list.cursor.ts` | 3 |
| `db/timestamps.ts` | 2 |
| `db/client.ts` | 4 |

Highest churn: **sub-form.repository** (pagination, search, uniqueness, versioning). Highest signal fix commits: `75df0386`, `7666ea58`, `9c238c9e`, `5aea58ea`, `d02739e3`, `edef4539`, `bdce5cb0`.

## 2. Ranked generic themes

1. **Cursor pagination correctness on MSSQL** — lexicographic seek (`OR`/`lt`/`eq`) instead of row-value/tuple SQL; stable sort keys; version/ignore incompatible tokens when sort changes.
2. **Soft-delete consistency** — every live-row filter and reference/in-use check must join parent/child and require `deletedAt IS NULL`.
3. **DB-owned clocks** — inserts omit app timestamps; updates/soft-deletes use `sql\`CURRENT_TIMESTAMP\``.
4. **Write return with DB-generated UUIDs** — prefer `insert().output()` over app `newEntityId` + post-tx `findById` / natural-key re-select.
5. **Search parity + LIKE safety** — dual backends (FTS vs LIKE) must scan the same columns; escape LIKE wildcards; bind parameters.
6. **App-enforced uniqueness under SERIALIZABLE** — when uniqueness cannot be a simple unique index (e.g. values inside JSON text), check + write inside a serializable transaction; allowlist dynamic SQL identifiers/collations.
7. **Concurrency for monotonic versions** — `UPDLOCK, HOLDLOCK` on parent + unique-constraint retry.
8. **Select projection / batching** — join-shaped list rows; `IN` batch for children instead of N+1 per parent.
9. **Infra hygiene** — hot-reload pool singleton; FULLTEXT DDL outside migrator transactions.

## 3. Correct patterns now

- List cursors for forms/templates: `createdAt` + `id` **DESC** with `or(lt(ts), and(eq(ts), lt(id)))` seek predicates (not `sql\`(a,b) > (...)\``).
- Sub-form list: versioned cursor payload (`v4` with sort/order/key/id); mismatched/legacy tokens decode to `null` (restart at first page), not mis-seek.
- Soft deletes via `softDeleteAt()`; list/find paths filter `isNull(deletedAt)`; in-use checks join live parents.
- Creates of heads/versions: `runSerializableTransaction` + uniqueness assert + `insert().output()`; schema defaults `NEWSEQUENTIALID`.
- Version append: parent row lock + max(version)+1 + unique retry on race.
- Search helper: FTS `CONTAINSTABLE` on `[name],[description]` or OPENJSON+LIKE on both columns with `ESCAPE` and wildcard escaping.
- Junction enrichment: `listJunctionRowsByFormIds(ids)` with `inArray` for published-list nesting.
- Dev `ConnectionPool` cached on `globalThis` to survive module re-eval; `FormsDbOrTx` for tx-capable helpers.
- Timestamp helpers leave insert clocks to DB defaults.

## 4. Remaining debt

- **Inconsistent list sort contracts across entities**: form / form-template / sub-form-template still use unversioned `{ createdAt, id }` cursors; only sub-form has explicit cursor versioning and multi-sort. Changing form list sort later will need the same versioning lesson.
- **appendVersion still re-selects after insert** instead of `insert().output()` used on creates — asymmetric write-return pattern.
- **LIKE on plain string columns** was removed from localized list search, but any new non-JSON `like()` filters must remember escape (history shows unescaped `%`/`_` search strings).
- **FTS catalog ensure** is service-specific SQL; pattern (DDL outside tx, idempotent, feature-detect) is generic but not shared yet.
- Sub-form `appendVersion` unique retry is a single re-attempt only (no backoff/loop) — acceptable for rare races but worth documenting as intentional.

## 5. Skill-candidate bullets (generic only)

- Prefer MSSQL-safe lexicographic cursor seeks over row-value / tuple comparisons in Drizzle raw SQL.
- When list sort key or direction changes, bump an explicit cursor version and treat incompatible tokens as “no cursor” (first page), never as a wrong seek.
- Soft-delete-aware reference checks: join the owning entity and require `deletedAt IS NULL` (junction-only counts lie).
- Do not set `createdAt`/`updatedAt`/`deletedAt` from `new Date()` in repositories; use DB `CURRENT_TIMESTAMP` / defaults.
- For UUID PKs with DB defaults, return inserted rows via `.output()` inside the same transaction.
- Dual search backends must query the **same** column set; document FTS vs LIKE fallback as one contract.
- Always `escapeSqlServerLikeWildcards` (+ `ESCAPE`) for user-supplied LIKE patterns.
- App-level uniqueness over JSON/text payloads: SERIALIZABLE transaction + parameterized checks; never interpolate user identifiers into SQL; allowlist collation fragments.
- Monotonic version numbers: lock parent (`UPDLOCK, HOLDLOCK`), compute next, rely on unique index + one retry.
- Batch child loads with `inArray(parentIds)` when listing parents with nested children.
- Cache MSSQL pools across hot reloads in non-production; type `Db | Tx` for helpers used inside transactions.
- Create FULLTEXT (and similar) objects outside Drizzle migrator transactions.

## 6. Domain-specific changes excluded

Skipped or not promoted as skill candidates (product/localization UX without a transferable repository rule beyond the generics above):

- Localized `name`/`description` JSON shape and FormCrafter field validators.
- `buildResolvedNameExpr` COALESCE fallback chain (requested → country → system → any active) — display/sort localization policy.
- Per-locale uniqueness **product** rule (conflict error per locale code); kept only the generic “JSON text uniqueness under SERIALIZABLE” angle.
- Frontend language switcher / forms-ui localization wiring (`00e8e769` UI portions).
- Form policy “reject unpublished sub-forms in composer” with grandfathering (`ad8bca13`) — domain policy, not DAL pattern (repo only toggled list sort incidentally).
- Removal of unused `require_approval` column (`2f2fb442`) — schema cleanup.
- Shared localization package extractions / Swagger localized schemas as product API concerns.
- FTS language `1033` hardcoding on forms indexes — content-language choice, not a repository pattern.

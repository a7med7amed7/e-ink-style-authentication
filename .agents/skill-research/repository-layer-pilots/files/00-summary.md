# Files Module — Repository Layer Git History Research

Pilot service: `modules/files/backend`  
Research date: 2026-07-21  
Method: `git log --oneline --follow` per file, then `git show` / `git log -p` on fix/security/review commits (WMS-346, WMS-353, WMS-388, WMS-451, WMS-359). Formatting-only noise skipped (`2d29f68e` unused-import cleanup).

---

## 1. Files analyzed + commit counts

| File | Commits (`--follow`) | Notes |
|------|---------------------|-------|
| `src/repositories/FileRepository.ts` | 9 | Soft-delete, batch authz, upload lifecycle, tag scoping (WMS-388) |
| `src/repositories/ThumbnailRepository.ts` | 2 | Soft-delete reads; upsert for unique pair (WMS-451) |
| `src/__tests__/FileRepository.test.ts` | 1 | Ported suite + `hasMismatchedTag` coverage (`a84fa2c2`) |
| `src/__tests__/ThumbnailRepository.test.ts` | 2 | Init + upsert rename asserting delete-then-insert |
| `src/db/client.ts` | 4 | `FilesDb` / `FilesDbOrTx`; pool singleton lineage |
| `src/db/schema.ts` | 6 | UUID helpers, `tag` column, thumbnail unique index |

**Key commits (repo-layer signal):**

| Hash | Subject | Patterns |
|------|---------|----------|
| `507d453d` | [WMS-346] File service initial setup | Soft-delete, batching, authz count, tx?, `.output()`, expiry queries |
| `8489ed28` / `097bce29` | [WMS-346] Duo review UUID fixes | `mssqlUuid` vs `mssqlUuidPrimaryKey` |
| `22423fd7` | [WMS-353] 2-phase upload lifecycle | Status typing on repo APIs |
| `cf03e71d` | [WMS-353] Security / placeholders | Descriptive PENDING placeholders; `findByStatus` |
| `cbf52c63` / `715bedc2` | [WMS-353] Expiry/scanning bugs | Optional `expiresAt` including clear-to-null |
| `2ec78eeb` | [WMS-353] Duo reviews | Clearer `FileNotFoundError` messages |
| `7b84d191` | [WMS-388] Service identity | Nullable `tag` column + pending create |
| `16359082` | [WMS-388] Security issues | `hasMismatchedTag` SQL authz |
| `8bbdb581` | [WMS-451] Thumbnail schemas/repos | Soft-delete reads; delete `.output()` cleanup |
| `15ff6a33` | [WMS-451] Security checks | `upsertThumbnail` delete-then-insert |

---

## 2. Themes ranked by recurrence / review pressure

1. **Soft-delete + write timestamps** — `isNull(deletedAt)` on reads; `deletedAt`+status on soft-delete; `updatedAt: new Date()` on every mutation (day-one, never regressed).
2. **Authz in SQL** — uploader set-equality (`isUserAuthorized`); later tag mismatch (`hasMismatchedTag`) with explicit null-tag policy (WMS-388).
3. **Batch / empty-list guards** — `inArray` for multi-ID find/update/authz; early return before empty `IN ()`.
4. **Upsert against unique composite keys** — thumbnail `(fileId, resolutionId)` delete-then-insert after unique violations (WMS-451).
5. **MSSQL write-return** — `.output()` on insert/update/delete; deleted rows drive blob cleanup.
6. **Transaction composability** — optional `tx?: FilesDbOrTx` + `tx \|\| this.db` (files style, not `withTx` clone).
7. **UUID column typing** — review forced FK columns onto `mssqlUuid`, not PK helper or plain varchar.
8. **Lifecycle predicates** — status-guarded promote; expiry cleanup `(status, expiresAt, deletedAt)`; placeholder values for incomplete rows.
9. **Select projection** — authz helpers project `{ id }` only; entity fetches still use full `.select()`.
10. **Nullable update semantics** — optional `expiresAt?: Date \| null` cleared via spread into `.set()`.

---

## 3. Stabilized “correct” patterns (with pointers)

| Pattern | Where |
|---------|-------|
| Soft-delete on default reads + optional `includeDeleted` | `FileRepository` find\* |
| Soft-delete on thumbnail artifact reads | `ThumbnailRepository.findByFileAndSize` / `findThumbnailsByFileId` |
| Soft-delete write: status + `deletedAt` + `updatedAt`; WHERE `isNull(deletedAt)` | `softDeleteFiles` / `updateStatus(DELETED)` |
| App `updatedAt` on every update | All FileRepository mutators |
| Empty-array guards before `inArray` | `findByIds`, `promoteFiles`, `softDeleteFiles`, authz helpers |
| Batch `inArray` find / update / authz | `FileRepository` |
| Authz: result length === requested length | `isUserAuthorized` |
| Authz: mismatch query with `isNotNull(tag)` + `not(eq(tag, …))` | `hasMismatchedTag` |
| Narrow `.select({ id })` for boolean authz | Both authz methods |
| Status-guarded bulk transition | `promoteFiles` (STAGED + not deleted) |
| Expiry cleanup predicates + supporting index | `findExpiredPending/StagedFiles`; `idx_files_status_cleanup` |
| `FilesDbOrTx` + optional `tx?` | `db/client.ts`, write methods |
| MSSQL `.output()` return | create / update / upsert insert / `deleteByFileId` |
| Upsert = delete by unique key then insert | `upsertThumbnail` |
| PK helper vs FK helper | `schema.ts` (`mssqlUuidPrimaryKey` vs `mssqlUuid`) |
| Descriptive incomplete-row placeholders | `createPendingFile` |
| Explicit null to clear nullable column | `updateFileMetadata.expiresAt` |

---

## 4. Remaining tech debt visible in current code

- **`upsertThumbnail` is not transactional** — delete then insert can race or leave a gap if insert fails; should wrap in `db.transaction` (or true MERGE/UPSERT when available).
- **Full-row `.select()` on entity paths** — acceptable for small file metadata rows; authz already projects narrowly; no sensitive-column denylist beyond that.
- **`ThumbnailRepository` has no `tx?` / `FilesDbOrTx`** — cannot join file soft-delete and thumbnail hard-delete in one DB transaction from the repo API alone.
- **Soft-delete column vs hard `deleteByFileId`** — reads filter `deletedAt`, but cleanup hard-deletes; dual model is intentional for blob cleanup but easy to misuse (insert after soft-delete of same unique pair still needs upsert).
- **`updateStatus` WHERE is ID-only** — does not require `isNull(deletedAt)`; can rewrite already-deleted rows’ status/`updatedAt`.
- **Two monorepo tx styles** — files uses optional `tx?`; languages uses `withTx()` clone. Skill should document both.
- **No cursor pagination / LIKE search** in this layer — N/A for files repos (do not invent).

---

## 5. Skill-candidate bullets (generic)

- **authz-in-sql**: Encode ownership/tenant checks as SQL predicates; for “all IDs allowed” compare result cardinality to input length; for mismatch detection query only offending rows; project `{ id }` only.
- **upsert-uniqueness**: On unique composite keys, delete-by-key then insert (or dialect upsert) and prefer a transaction around both steps.
- **timestamps-soft-delete**: `isNull(deletedAt)` on reads; pair `deletedAt` with status on soft-delete; stamp `updatedAt` in app code on mutations; SQL `CURRENT_TIMESTAMP` defaults for insert.
- **filter-edge-cases**: Guard empty `inArray`; status-guard state transitions in WHERE; expiry queries combine status + time + soft-delete; allow `null` to clear nullable update fields; encode null policy for new ownership columns.
- **batching-n1**: Multi-ID find/update/authz via single `inArray` query.
- **select-projection**: Boolean/existence helpers must not `select()` full rows.
- **write-return**: MSSQL Drizzle `.output()` on insert/update/delete; return deleted rows when callers need external cleanup keys.
- **transactions**: `DbOrTx` union + optional `tx` (or `withTx` clone — see languages pilot).
- **uuid-typing**: Use `mssqlUuidPrimaryKey` only for PKs; `mssqlUuid` for FK/reference columns; avoid bare varchar(36) when shared helpers exist.
- **other:lifecycle-placeholders**: For NOT NULL columns on incomplete entities, use obviously non-production sentinel values.

---

## Domain-specific excluded (not skill candidates)

- File upload 2-phase state machine as product (PENDING → STAGED → AVAILABLE) — pattern of **status-guarded updates** is generic; the enum names are not.
- Antivirus/scanning workflow and storage-provider choice — service domain.
- Thumbnail resolution catalog as live DB enum for `?size=` — product feature, not a persistence skill (live-read catalog is a minor “no cache” note only).
- Localization — not present in files service.

---

## Issue index

| # | File | Tag |
|---|------|-----|
| 01 | Tag / tenant scoping in SQL | `authz-in-sql` |
| 02 | Upsert delete-then-insert | `upsert-uniqueness` |
| 03 | Soft-delete read filter | `timestamps-soft-delete` |
| 04 | Write `updatedAt` on mutations | `timestamps-soft-delete` |
| 05 | Empty `inArray` guard | `filter-edge-cases` |
| 06 | Batch find-by-ids | `batching-n1` |
| 07 | Authz set-equality count | `authz-in-sql` |
| 08 | Narrow select for authz | `select-projection` |
| 09 | UUID PK vs FK helpers | `uuid-typing` |
| 10 | Optional `tx` + `DbOrTx` | `transactions` |
| 11 | MSSQL `.output()` write-return | `write-return` |
| 12 | Soft-delete status + `deletedAt` | `timestamps-soft-delete` |
| 13 | Status-guarded bulk update | `filter-edge-cases` |
| 14 | Expiry cleanup predicates | `filter-edge-cases` |
| 15 | Nullable tag mismatch semantics | `authz-in-sql` |
| 16 | Delete `.output()` for cleanup | `write-return` |
| 17 | Lifecycle placeholder values | `other:lifecycle-placeholders` |
| 18 | Optional null-clear on update | `filter-edge-cases` |

## Files produced

- `00-summary.md` (this file)
- `issues/01` … `issues/18`

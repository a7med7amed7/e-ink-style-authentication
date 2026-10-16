# Cross-pilot synthesis — repository layer

**Date:** 2026-07-21  
**Pilots:** logs, forms, users, files, languages  
**Sources:** each service’s `00-summary.md` + `issues/*`  
**Agents:** [Logs](69c1e39c-7ca5-4fb9-ac4f-fb9cd27b8d53), [Forms](6df26575-e9e7-46e7-aa07-fef11243e0b1), [Users](a8299db5-0289-4900-96d0-a36bf7cd295d), [Files](54f50048-4f37-4baa-93b8-c77432243905), [Languages](898d9652-f0db-4657-99d6-fa28547b79ea)

This document only promotes patterns that are **feature-agnostic** and appear in **≥2 pilots** (or are a hard MSSQL correctness rule proven in ≥1 pilot with clear transferability). Localization product rules were excluded by the forms/languages pilots.

---

## Tag frequency (by service presence)

| Tag | logs | forms | users | files | languages | Services |
|-----|:----:|:-----:|:-----:|:-----:|:---------:|:--------:|
| `timestamps-soft-delete` | ✓ | ✓ | ✓ | ✓ | ✓ | **5** |
| `write-return` | ✓ | ✓ | ✓ | ✓ | ✓ | **5** |
| `batching-n1` / empty `inArray` | ✓ | ✓ | ✓ | ✓ | ✓ | **5** |
| `transactions` / `DbOrTx` | | ✓ | ✓ | ✓ | ✓ | **4** |
| `select-projection` | | ✓ | ✓ | ✓ | ✓ | **4** |
| `filter-edge-cases` | ✓ | | ✓ | ✓ | ✓ | **4** |
| `uuid-typing` | ✓ | | ✓ | ✓ | | **3** |
| `like-search` | ✓ | ✓ | ✓ | | | **3** |
| `cursor-pagination` | ✓ | ✓ | ✓* | | | **3** |
| `upsert-uniqueness` | | | ✓ | ✓ | ✓ | **3** |
| `authz-in-sql` | | | ✓ | ✓ | | **2** |
| `concurrency-isolation` | | ✓ | | | | 1† |
| `search-parity` | | ✓ | | | | 1† |
| `dynamic-sql-safety` | | ✓ | | | | 1† |
| pool singleton | ✓ | ✓ | ✓ | ✓ | | **4** |

\* users mainly uses **offset** pagination; still a list-contract theme.  
† Single-pilot but transferable MSSQL/data-access technique (not product-specific).

---

## Universal patterns (all or nearly all pilots)

### 1. Soft-delete + timestamps
- Read paths: `isNull(deletedAt)` (or active-flag equivalent).
- Soft-delete / updates must bump `updatedAt` (app `touchUpdatedAt` / `sql\`CURRENT_TIMESTAMP\``) — MSSQL defaults do not refresh on UPDATE.
- Soft-delete on **joined parents** in reference/in-use checks (forms).
- Evidence: users `01`, files `03`/`04`/`12`, logs `02`, forms `03`/`04`, languages `10`/`13`.

### 2. Write-return on MSSQL
- Dominant accepted pattern: `insert()/update()/delete().output()`.
- Tension: logs historically used client `randomUUID()` because return payload was unreliable; forms/users/languages prefer **DB `NEWSEQUENTIALID` + `.output()`**.
- Skill rule: prefer DB-generated PK + `.output()`; document client-UUID only as a last resort with justification.
- Evidence: users `04`, files `11`, languages `07`, forms `07`, logs `03`.

### 3. Batching + empty guards
- `inArray` / `notInArray` for multi-id; early `[]` when `ids.length === 0`.
- List parents → one batch for children (`Promise.all` + `Map`), not per-row queries.
- Evidence: all five pilots.

### 4. Transaction composability
- Two accepted styles: optional `tx?: DbOrTx` (users/files) vs `withTx()` clone + capability guard (languages/comments).
- Reads that feed audit/side effects belong **inside** the same tx as the write.
- Evidence: languages `01`–`03`, files `10`, users `10`, forms (DbOrTx helpers).

### 5. Select projection
- Named `*ColsPublic` / list selects; omit LOBs and sensitive columns from default lists.
- Authz helpers select `{ id }` only.
- Evidence: users `02`/`17` (review-driven approval split), files `08`, languages `06`, forms `12`.

---

## Strong multi-service patterns (3–4 pilots)

### 6. UUID typing end-to-end
- Repo signatures/tests migrate with schema (`number` → `string`).
- `mssqlUuidPrimaryKey` **only** for PKs; `mssqlUuid` / nullable for FKs (files review).
- Guard `findById` against empty/non-string ids.
- Evidence: logs `07`–`09`, users `05`/`16`, files `09`.

### 7. LIKE / search safety
- Escape `% _ [ ]` via shared helper; prefix vs contains semantics documented.
- Evidence: logs `04`/`05`, users `03`, forms `06`.

### 8. List pagination contracts
- MSSQL: lexicographic seek `or(lt/gt, and(eq, lt/gt))` — **never** tuple `(a,b) > (x,y)`.
- `limit + 1` over-fetch; matching `ORDER BY` + composite index.
- When sort key/direction changes: **version cursor tokens**; ignore incompatible tokens.
- Offset+count remains valid for some admin lists (users) if documented.
- Evidence: logs `01`, forms `01`/`02`, users `07`.

### 9. Upsert / uniqueness write patterns
- Delete-then-insert (or clear-then-reassign) for composite/filtered uniques; prefer wrapping in a transaction.
- Evidence: files `02`, languages `14`, users `21`.

### 10. Authz / isolation in SQL
- Ownership/tenant/tag predicates in `WHERE`; set-equality (`result.length === ids.length`); mismatch queries.
- Workflow/state filters in SQL, not post-filter in JS when isolation matters.
- Evidence: files `01`/`07`/`15`, users `18`.

---

## Valuable single-pilot but transferable (optional skill sections)

| Pattern | Pilot | Generic form |
|---------|-------|--------------|
| SERIALIZABLE + set-based conflict check | forms | App uniqueness when a plain unique index cannot express the rule |
| UPDLOCK/HOLDLOCK + unique retry | forms | Monotonic version allocation under concurrency |
| Dual search backend column parity | forms | FTS vs LIKE (or any dual path) must hit same columns |
| Identifier/collation allowlists | forms | Dynamic SQL safety |
| FTS DDL outside migrator tx | forms | Already owned by `writing-mssql-drizzle-migrations` — **do not duplicate** |
| Dead `BaseRepository` | users | Don’t ship unused abstract bases |
| Dev pool singleton | logs/forms/users/files | Hot-reload / test re-run hygiene |

---

## Overlap with existing skills (do not re-teach)

| Existing skill | Already covers | Repo skill should |
|----------------|----------------|-------------------|
| `writing-mssql-drizzle-migrations` | IF EXISTS, NEWSEQUENTIALID, CHECK, INCLUDE, FTS outside tx | Point only |
| `building-fastify-drizzle-services` | N+1 one-liner, updatedAt one-liner, LIKE one-liner, reply.sent | Go deeper on **repository** mechanics; avoid Fastify HTTP rules |
| `writing-reusable-shared-code` | Shared helper design / `table: any` | Call-site rules only |
| `pre-push-branch-readiness` | Real DB integration evidence | Optional “prove with integration test” pointer |

---

## Proposed skill boundaries (for confirmation)

See parent agent proposal in chat. Recommended split:

1. **`writing-drizzle-mssql-repositories`** — universal write/read contracts (1–5, 6, parts of 9–10).
2. **`mssql-repository-queries-and-pagination`** — lists, cursors, LIKE, search parity (7–8 + search-parity).
3. **Optional:** fold concurrency/dynamic-SQL into (1) as an advanced section, or a thin third skill if the body gets too large.

Do **not** create a localization skill.

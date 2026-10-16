# Version cursor tokens when sort key changes

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/modules/sub-form/domain/sub-form-list.cursor.ts`
- File: `platform/backend/services/forms/src/modules/sub-form/infrastructure/sub-form.repository.ts`
- File: `platform/backend/services/forms/src/modules/sub-form/__tests__/sub-form-list.cursor.test.ts`
- Commit: `7666ea58` — `fix(forms): [WMS-422] version sub-form list cursors for updatedAt sort`
- Commit: `00e8e769` — later generalized to `v4` with explicit `sort`/`order`/`key` (same pattern)

## Before (rejected / buggy)
List order flipped (e.g. `createdAt` ASC → `updatedAt` DESC) while still decoding old cursor shapes and applying them as seek keys. Clients mid-pagination silently skipped/duplicated rows.

## After (accepted / fixed)
- Encode an explicit cursor schema version (`v2`, then `v3`/`v4`).
- Decode: accept current schema; **legacy incompatible tokens return `null`** (treat as first page); malformed payloads throw `InvalidCursorError`.
- Tests lock in “ignore legacy createdAt/updatedAt tokens instead of mis-paginating.”
- Later `v4` also ignores tokens whose embedded `sort`/`order` do not match the current request.

## Why it matters
Keyset cursors are opaque contracts tied to the sort key. Changing sort without versioning (or without rejecting old tokens) is a silent pagination bug in any Drizzle list repository.

## Skill candidate tag
cursor-pagination

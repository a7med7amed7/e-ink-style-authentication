# INSERT `.output()` for DB-generated UUID primary keys

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/modules/sub-form/infrastructure/sub-form.repository.ts`
- File: `platform/backend/services/forms/src/modules/form/infrastructure/form.repository.ts`
- File: `platform/backend/services/forms/src/db/schema.ts` (`mssqlNewSequentialIdDefault`)
- Commit: `5aea58ea` — drop app `newEntityId()`, rely on DB defaults; early re-select after insert
- Commit: `63c73ac1` — create paths use `insert(...).output().values(...)` inside the write transaction

## Before (rejected / buggy)
```ts
const headId = newEntityId();
await tx.insert(subForms).values({ id: headId, ... });
// after commit:
const head = await this.findById(headId);
```
Or natural-key re-select (`findByName`) when uniqueness/locale rules made that brittle. Extra round-trips and race windows after commit.

## After (accepted / fixed)
Schema: `id ... default(mssqlNewSequentialIdDefault)`. Creates:

```ts
const insertedHead = await tx.insert(subForms).output().values({ /* no id */ });
head = insertedHead[0];
```

Same pattern for version rows. Remaining debt: `appendVersion` still selects by `(sub_form_id, version)` after insert instead of `.output()`.

## Why it matters
MSSQL + Drizzle does not give Postgres-style `returning` on all paths the same way; `.output()` is the reliable way to obtain server-generated keys inside the transaction that created them.

## Skill candidate tag
write-return

# App-enforced uniqueness under SERIALIZABLE isolation

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/modules/sub-form/infrastructure/sub-form.repository.ts`
- File: `platform/backend/services/forms/src/modules/form/infrastructure/form.repository.ts`
- Related: `platform/backend/shared/lib/src/localization/assert-localized-field-unique.ts` (extracted in `f10ac6c2`)
- Commit: `63c73ac1` — create/update wrapped in `runSerializableTransaction` + uniqueness assert before insert
- Commit: `f10ac6c2` — moved serializable helper + generic assert into shared lib

## Before (rejected / buggy)
Plain `db.transaction` + unique index on a scalar `name` column (or post-insert conflict only). When the unique surface moved into a **JSON/text column** (values not indexable as a simple unique key), concurrent writers could both pass a check and insert duplicates under default isolation.

## After (accepted / fixed)
```ts
await runSerializableTransaction(this.db, async (tx) => {
  await assertNameUniquePerLocale(tx, table, input.name, currentId);
  await tx.insert(table).output().values({ ... });
});
```
Pattern: raise isolation → assert no conflicting live row → write. Shared helper documents conflict mapping to domain errors.

## Why it matters
Whenever uniqueness is enforced in application SQL (JSON paths, computed normalized keys, multi-column business rules without a matching unique index), repositories need SERIALIZABLE (or an equivalent lock strategy) around check+write—not a best-effort read then insert.

## Skill candidate tag
concurrency-isolation

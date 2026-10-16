# Parent row lock + unique retry for monotonic versions

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/modules/sub-form/infrastructure/sub-form.repository.ts`
- Commit: `5aea58ea` — `refactor(forms): [WMS-15] align modules with ddd layout and shared audit auth` (introduces `UPDLOCK, HOLDLOCK` + unique-constraint retry)

## Before (rejected / buggy)
Compute `nextVersion = max(version)+1` and insert without locking the parent. Concurrent appends raced to the same version number; app-generated version ids did not prevent the unique `(sub_form_id, version)` collision.

## After (accepted / fixed)
```ts
async appendVersion(...) {
  try {
    return await this.appendVersionInTransaction(input);
  } catch (error) {
    if (isMssqlUniqueConstraintError(error)) {
      return this.appendVersionInTransaction(input); // one retry
    }
    throw error;
  }
}

// inside tx:
await tx.execute(sql`
  SELECT [id] FROM [sub_forms] WITH (UPDLOCK, HOLDLOCK)
  WHERE [id] = ${input.subFormId}
`);
// then max(version)+1 insert
```
Defense in depth: pessimistic lock on parent + unique index as the source of truth + single retry.

## Why it matters
Any Drizzle/MSSQL repository that allocates monotonic per-parent counters (versions, revision numbers, sequence slots) needs an explicit concurrency strategy—not just `max()+1` in a default transaction.

## Skill candidate tag
concurrency-isolation

# Batch child loads with `inArray` instead of N+1

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/modules/form/infrastructure/form.repository.ts`
- Commit: `edef4539` — `feat(forms): [WMS-15] return nested subforms in published forms list`

## Before (rejected / buggy)
`listJunctionRows(formId)` only — listing many published forms would call once per parent (N+1) to attach nested children.

## After (accepted / fixed)
```ts
async listJunctionRows(formId: string) {
  return this.listJunctionRowsByFormIds([formId]);
}

async listJunctionRowsByFormIds(formIds: string[]) {
  if (formIds.length === 0) return [];
  // ...
  .where(and(inArray(formsSubforms.form_id, formIds), isNull(subForms.deletedAt)))
  .orderBy(asc(formsSubforms.form_id), asc(formsSubforms.order));
}
```
Single-id API retained as a thin wrapper; empty-id short-circuit avoids invalid `IN ()`.

## Why it matters
When list endpoints gain nested children, repositories should expose a batch-by-parent-ids query. Soft-delete filters still apply on joined child entities.

## Skill candidate tag
batching-n1

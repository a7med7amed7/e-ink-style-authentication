# Soft-delete-aware reference / in-use checks

## Service
forms

## Evidence
- File: `platform/backend/services/forms/src/modules/sub-form-template/infrastructure/sub-form-template.repository.ts`
- File: `platform/backend/services/forms/src/modules/sub-form-template/__tests__/sub-form-template.repository.test.ts`
- Commit: `9c238c9e` — `fix(forms): [WMS-15] ignore soft-deleted form templates in sub-form template in-use check`

## Before (rejected / buggy)
`isReferencedByFormTemplate` counted junction rows only:

```ts
.from(formTemplateItems)
.where(eq(formTemplateItems.sub_form_template_id, templateId));
```

Soft-deleted parents still blocked deactivate.

## After (accepted / fixed)
Inner-join the parent entity and require a live row:

```ts
.from(formTemplateItems)
.innerJoin(formTemplates, eq(formTemplateItems.form_template_id, formTemplates.id))
.where(and(
  eq(formTemplateItems.sub_form_template_id, templateId),
  isNull(formTemplates.deletedAt)
));
```

Repository tests assert the join + soft-delete filter path.

## Why it matters
Any “in use?” / FK-presence guard that only inspects junction or child tables will treat soft-deleted parents as live. Soft-delete must be part of every liveness predicate, including cross-entity checks.

## Skill candidate tag
timestamps-soft-delete

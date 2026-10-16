# Computed display codes (SQL projection + app formatter)

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/OrganizationRepository.ts`
- Commit: `8442a85f` — fix(orgs): [WMS-220] edit page and org code
- File: `modules/users/backend/src/repositories/DepartmentRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
Org list returned raw `code_number` integer from insert `.output()` — not user-facing `ORG-00042` format.

```typescript
return inserted[0]!; // exposed internal code_number
```

## After (accepted / fixed)
**Read path:** SQL-computed column in public projection:

```typescript
const orgColsPublic = {
  code: sql<string>`CONCAT('ORG-', RIGHT(CONCAT('00000', CAST(${organizations.code_number} AS varchar(10))), 5))`,
  ...
} as const;
```

**Write path:** strip internal number, format in TypeScript:

```typescript
const { code_number: codeNumber, ...rest } = inserted[0]!;
return { ...rest, code: formatOrganizationCode(codeNumber) };
```

Departments use `DEPT-` prefix; `findForStructure` builds hierarchical codes in memory from parent/child `code_number` map.

## Why it matters
Human-readable codes should not leak raw sequence integers on reads. SQL formatting keeps sort/filter consistent; TS formatting on create response matches UI expectations.

## Skill candidate tag
other:computed-display-codes

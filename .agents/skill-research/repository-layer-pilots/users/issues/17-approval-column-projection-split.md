# Split approval column projection (general vs admin list)

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `537e774c` — feat(users): [WMS-370] add user approval backend changes
- Commit: `9903e7e5` — fix(users): [WMS-370] address PR review on approval flow and access control
- Commit: `5c192847` — chore(users): [WMS-370] review comments

## Before (rejected / buggy)
Initial approval feature added audit fields to `userColsPublic` and duplicated them in `findAllPaginated` inline selects — general user list exposed `rejection_reason`, `approved_by`, etc.

```typescript
const userColsPublic = {
  ...
  approval_status: users.approval_status,
  rejection_reason: users.rejection_reason,
  approved_at: users.approved_at,
  approved_by: users.approved_by,
  rejected_at: users.rejected_at,
  rejected_by: users.rejected_by,
} as const;
```

`findAllPaginated` used 20+ line inline column list instead of spread.

## After (accepted / fixed)
PR review (`9903e7e5`, `5c192847`) split projections:

```typescript
const userColsPublic = {
  ...
  approval_status: users.approval_status, // status only on general list
} as const;

const userApprovalCols = {
  ...userColsPublic,
  rejection_reason: users.rejection_reason,
  approved_at: users.approved_at,
  approved_by: users.approved_by,
  rejected_at: users.rejected_at,
  rejected_by: users.rejected_by,
} as const;
```

- `findAllPaginated` → `...userColsPublic`
- `findPendingApprovalsPaginated` / `findApprovalById` → `userApprovalCols`
- `markRejected` clears `approved_at` / `approved_by` when rejecting (`5c192847`)

## Why it matters
Workflow audit columns are sensitive — only approval-specific endpoints should project them. Reuse public map via spread; never duplicate column lists.

## Skill candidate tag
select-projection

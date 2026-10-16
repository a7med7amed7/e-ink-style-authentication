# Intentional omission of soft-delete filter (assignment lookup)

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/DepartmentUserRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
N/A — pattern introduced with org repos port from monolith.

## After (accepted / fixed)
`findExistingAssignment` deliberately **does not** filter `isNull(departmentUsers.deletedAt)`:

```typescript
// top(1), no deletedAt filter — covers all statuses (mirrors monolith findExistingAssignment)
async findExistingAssignment(deptId: string, userId: string, tx?: UsersDbOrTx) {
  const rows = await db
    .select(deptUserColsPublic)
    .top(1)
    .from(departmentUsers)
    .where(and(
      eq(departmentUsers.department_id, deptId),
      eq(departmentUsers.user_id, userId)
    ));
  return rows[0] ?? null;
}
```

Contrast with `findByDepartment` which requires `isNull(departmentUsers.deletedAt)` and `is_active`.

## Why it matters
Upsert/re-invite flows must see soft-deleted historical assignments to reactivate vs create duplicate. Blindly adding `deletedAt IS NULL` breaks monolith parity. Skill should flag methods where soft-delete filter is intentionally absent.

## Skill candidate tag
filter-edge-cases

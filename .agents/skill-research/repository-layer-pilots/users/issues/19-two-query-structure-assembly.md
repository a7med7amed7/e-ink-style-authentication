# Two-query tree assembly (avoid cartesian explosion)

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/DepartmentRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
No org structure endpoint — monolith loaded nested dept+users in ORM with risk of cartesian product on multi-join.

## After (accepted / fixed)
`findForStructure` documents intentional 2-query pattern:

```typescript
// 1) departments for org
const deptRows = await db.select({ ...deptColsPublic, code_number, organization_code_number })
  .from(departments)
  .innerJoin(organizations, ...)
  .where(...);

// 2) all department_users for dept IDs in one query
const duRows = await db.select({ ... })
  .from(departmentUsers)
  .innerJoin(organizationRoles, ...)
  .innerJoin(users, ...)
  .where(inArray(departmentUsers.department_id, deptIds), ...);

// in-memory group by department_id
const duByDept = new Map<string, typeof duRows>();
for (const du of duRows) { ... }

return withStructureCodes.map((d) => ({ ...d, departmentUsers: duByDept.get(d.id) ?? [] }));
```

`findComplete` uses `Promise.all` for parallel fetches after initial dept lookup — same principle.

## Why it matters
Deep joins on hierarchical data multiply rows. Fixed small number of queries + in-memory assembly scales better than one giant join.

## Skill candidate tag
batching-n1

# Named public column projections (exclude sensitive fields)

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `afce75f8` — Replace Prisma with Drizzle
- File: `modules/users/backend/src/repositories/OrganizationRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
Prisma used a `userSelectWithoutPassword` object, but paginated queries later duplicated long inline column lists (see issue 17). Password inclusion was a boolean flag on `findFirst`.

## After (accepted / fixed)
Each repository defines a `*ColsPublic` const map and reuses it:

```typescript
const userColsPublic = {
  id: users.id,
  email: users.email,
  // ... no password
} as const;

// default read
.select(userColsPublic)

// password only when explicitly requested
includePassword ? db.select().top(1)... : db.select(userColsPublic)...
```

Same pattern: `orgColsPublic`, `deptColsPublic`, `deptUserColsPublic`, `invitationColsPublic`, `orgRoleColsPublic`.

## Why it matters
Central projections prevent password/hash leakage on list endpoints and keep select lists DRY when joins add nested shapes.

## Skill candidate tag
select-projection

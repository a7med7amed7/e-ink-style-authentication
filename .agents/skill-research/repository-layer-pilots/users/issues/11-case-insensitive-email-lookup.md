# Case-insensitive email/name lookup (two-step resolve)

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `afce75f8` — Replace Prisma with Drizzle
- File: `modules/users/backend/src/repositories/OrganizationRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories
- File: `modules/users/backend/src/repositories/EndUserInvitationRepository.ts`
- Commit: `766ac28b` — feat(repos): [WMS-220] add org reposotories

## Before (rejected / buggy)
Prisma used raw SQL for email because SQL Server collation made exact match unreliable:

```typescript
const idRows = await this.prisma.$queryRaw`
  SELECT id FROM users WHERE ... LOWER(LTRIM(RTRIM(CAST(email AS NVARCHAR(4000))))) = ${normalized}
`;
```

## After (accepted / fixed)
Drizzle parameterized `sql` fragment — column ref bound separately from literal:

```typescript
const normalized = email.toLowerCase().trim();
const idRows = await this.db
  .select({ id: users.id })
  .top(1)
  .from(users)
  .where(and(
    isNull(users.deletedAt),
    sql`LOWER(LTRIM(RTRIM(CAST(${users.email} AS NVARCHAR(4000))))) = ${normalized}`
  ));
const resolvedId = idRows[0]?.id;
if (resolvedId == null) return null;
// second query fetches full row (with or without password projection)
```

Same pattern for `organizations.name` uniqueness and invitation email lookups.

## Why it matters
SQL Server string comparison pitfalls require normalize-in-SQL, not JS-only lowercase. Two-step (id resolve → fetch) keeps password projection control.

## Skill candidate tag
other:case-insensitive-lookup

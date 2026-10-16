# Left-join optional relation null normalization

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `6480dfc4` — feat: add external + internal services and routes
- File: `modules/users/backend/src/repositories/OrganizationRepository.ts`
- Commit: `8442a85f` — fix(orgs): [WMS-220] edit page and org code

## Before (rejected / buggy)
Early paginated query returned raw join rows where `Category` could be `{ id: null, name: null }` from left join — ambiguous vs truly absent.

## After (accepted / fixed)
Post-map normalization:

```typescript
const data = rows.map(({ Category, ...rest }) => ({
  ...rest,
  Category: Category?.id != null ? Category : null,
}));
```

Applied to `Category`, formerly `Role`, in user and org list endpoints. `findWithStructure` applies same rule after join.

## Why it matters
API consumers should see `null` for absent optional relations, not empty nested objects. Prevents frontend truthy checks on `{}`.

## Skill candidate tag
other:join-null-normalization

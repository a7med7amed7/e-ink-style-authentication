# Dead `BaseRepository` abstract class

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/BaseRepository.ts`
- Commit: `c2b86f1f` — Init Commit
- Commit: `afce75f8` — Replace Prisma with Drizzle

## Before (rejected / buggy)
Init commit had a Prisma-backed abstract base with `protected prisma` and `NotFoundError` imports. Intended to deduplicate CRUD across repositories.

```typescript
export abstract class BaseRepository<T> {
  protected prisma: PrismaClient;
  async findById(...) { throw new Error('findById must be implemented by subclass'); }
  // all methods throw — template only
}
```

## After (accepted / fixed)
Drizzle migration stripped Prisma dependency but left the same throw-only stubs. **No repository extends `BaseRepository`** — each concrete class implements Drizzle patterns directly (`UserRepository`, `OrganizationRepository`, etc.).

## Why it matters
Template abstractions that are never subclassed add noise and imply a pattern the codebase does not follow. Skill should prefer concrete Drizzle repos + shared helpers (`timestamps.ts`, column maps) over inheritance.

## Skill candidate tag
dead-abstraction

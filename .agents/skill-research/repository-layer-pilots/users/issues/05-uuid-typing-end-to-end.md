# Propagate string UUID types through repository APIs

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `2c180d90` — feat(types): [WMS-2] adjust users svc types after uuid changes
- File: `modules/users/backend/src/repositories/OtpRepository.ts`
- Commit: `2c180d90` — feat(types): [WMS-2] adjust users svc types after uuid changes
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `a5c70a14` — fix(notifications): [WMS-16] rule form selects, recipient labels, and UUID fan-out lookup

## Before (rejected / buggy)
Integer IDs with parse/coerce at repository boundary:

```typescript
async findById(id: number | string, includePassword = false) {
  const numericId = typeof id === 'string' ? parseInt(id, 10) : id;
  if (typeof numericId !== 'number' || Number.isNaN(numericId)) return null;
  // ...
}

async findManyByIds(ids: ReadonlyArray<number>): Promise<Array<{ id: number; ... }>>
```

Bulk fan-out from notifications failed when schema expected UUID strings.

## After (accepted / fixed)
All ID parameters and FK fields typed as `string`; no `parseInt` at repo layer:

```typescript
async findById(id: string, includePassword = false) { ... }
async softDeleteMany(ids: string[]) { ... }
async findManyByIds(ids: ReadonlyArray<string>, ...) { ... }
```

Cross-service commit (`a5c70a14`) updated JSDoc and return shape to align internal bulk API with UUID PKs.

## Why it matters
Mixing numeric coercion with UUID columns causes silent lookup failures. Repositories should match schema PK type exactly.

## Skill candidate tag
uuid-typing

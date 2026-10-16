# DbOrTx union type for transaction-aware repositories

## Service
languages

## Evidence
- File: `modules/languages/backend/src/db/client.ts`
- Commit: `9a364675` — `feat(languages): [WMS-460] add languages microservice`
- Note: `initial-design`

## Before (rejected / buggy)
N/A — pattern introduced correctly. Anti-pattern avoided: repositories typed only as full `db` client, forcing services to pass transactions through untyped `any` or duplicate query logic inside transaction callbacks.

## After (accepted / fixed)
Export a union type that accepts either the root Drizzle client or a transaction handle:

```typescript
export type LanguagesDb = typeof db;
export type LanguagesDbOrTx =
  | LanguagesDb
  | Parameters<Parameters<LanguagesDb['transaction']>[0]>[0];
```

All repositories take `LanguagesDbOrTx` in the constructor, so every method can run against pooled connection or an open transaction with the same API.

## Why it matters
Deriving `DbOrTx` from Drizzle's `transaction` callback parameter keeps the tx type in sync with the ORM version. Repositories become composable building blocks for multi-step atomic operations without a separate "transactional repository" class.

## Skill candidate tag
transactions

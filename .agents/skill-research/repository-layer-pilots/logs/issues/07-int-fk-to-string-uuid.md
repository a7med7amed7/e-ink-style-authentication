# Migrate integer FK columns to string UUID storage

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/db/schema.ts`, `AuditLogRepository.ts`, `__tests__/AuditLogRepository.test.ts`
- Commit: `a05d9dbd` — `feat(auth-gateway-logs): [WMS-2] turn into uuid format for user id` (schema NVARCHAR columns)
- Commit: `7bf0d0a1` — `fix(logs): [WMS-192] Int to UUID tests fix` (repo + test alignment)

## Before (rejected / buggy)
```typescript
// schema
entity_id: c.int('entity_id'),
actor: c.int('actor').notNull(),
target: c.int('target'),

// repository create signature
entity_id: number | null;
actor: number;

// tests
entity_id: 123,
actor: 456,
```

## After (accepted / fixed)
```typescript
// schema
entity_id: c.nvarchar('entity_id', { length: 36 }),
actor: c.nvarchar('actor', { length: 36 }).notNull(),

// repository
entity_id: string | null;
actor: string;

// tests
const TEST_ENTITY_ID = '550e8400-e29b-41d4-a716-446655440000';
```

## Why it matters
When platform identifiers become UUIDs, schema, repository method types, and integration tests must migrate together. Leaving `number` types in the repo layer after an NVARCHAR migration causes silent coercion bugs at the DB boundary.

## Skill candidate tag
uuid-typing

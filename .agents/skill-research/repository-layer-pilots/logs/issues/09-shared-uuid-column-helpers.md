# Shared UUID column helpers from monorepo lib

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/db/schema.ts`
- Commit: `59ea5ac3` — `feat(log): [WMS-269] Audit logs - forms`
- Related: prior local `customType` in `1c988dda` — `Changing auto incremented ID to UUID`

## Before (rejected / buggy)
```typescript
const uniqueidentifier = customType<{ data: string; driverData: string }>({
  dataType() { return 'uniqueidentifier'; },
  toDriver(val: string): string { return val; },
  fromDriver(val: string): string { return val; },
});

id: uniqueidentifier('id').notNull().default(sql`NEWID()`),
```

Per-service custom UUID type duplicated across services; `NEWID()` default is random (worse insert locality than sequential GUID).

## After (accepted / fixed)
```typescript
import { mssqlNewSequentialIdDefault, mssqlUuidPrimaryKey } from '@wfe/shared-lib';

id: mssqlUuidPrimaryKey('id').notNull().default(mssqlNewSequentialIdDefault),
```

## Why it matters
Centralizing MSSQL UUID column definitions ensures consistent driver mapping, default generation (`NEWSEQUENTIALID()`), and reduces per-service drift when the shared abstraction is updated.

## Skill candidate tag
uuid-typing

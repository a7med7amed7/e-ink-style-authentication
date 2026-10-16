# Client-generated UUID when MSSQL insert cannot RETURN

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/repositories/AuditLogRepository.ts`
- Commit: `207e197b` — `refactor(logs): [WMS-17] Refactoring the codebase, remove empty files, improve reusability (resolved conflicts)`
- Related: `__tests__/AuditLogRepository.test.ts` (`jest.mock('crypto')` for deterministic UUID, commit `93f76ddf`)

## Before (rejected / buggy)
```typescript
const result = await this.db.insert(auditLogs).values({
  ...auditLogData,
  ...insertTimestamps(),
});
return result[0]?.id ?? '';  // MSSQL Drizzle insert does not return row
```

## After (accepted / fixed)
```typescript
const id = randomUUID();
await this.db.insert(auditLogs).values({
  id,
  ...auditLogData,
  ...insertTimestamps(),
});
return id;
```

## Why it matters
SQL Server + Drizzle does not reliably support `RETURNING` on insert the way Postgres does. Pre-generating the PK in application code is the stable pattern for returning the new row's identifier to callers.

## Skill candidate tag
write-return

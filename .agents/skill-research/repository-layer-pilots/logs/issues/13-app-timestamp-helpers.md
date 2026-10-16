# App-level timestamp helpers alongside SQL defaults

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/db/timestamps.ts`, `db/schema.ts`, `AuditLogRepository.ts`
- Commit: `afce75f8` — `Replace Prisma with Drizzle` (helpers created)
- Related: `9b23904b` — migration path doc fix only

## Before (rejected / buggy)
Prisma handled `createdAt`/`updatedAt` via ORM hooks. After migration to Drizzle on MSSQL, no automatic timestamp management at ORM layer.

## After (accepted / fixed)
```typescript
// schema.ts — DB defaults
createdAt: c.datetime2('createdAt').notNull().default(sql`CURRENT_TIMESTAMP`),
updatedAt: c.datetime2('updatedAt').notNull().default(sql`CURRENT_TIMESTAMP`),

// timestamps.ts — app helpers
export function insertTimestamps() {
  const t = new Date();
  return { createdAt: t, updatedAt: t };
}

// repository create
await this.db.insert(auditLogs).values({
  id,
  ...auditLogData,
  ...insertTimestamps(),
});
```

`touchUpdatedAt()` documented for future update paths.

## Why it matters
Drizzle on SQL Server has no built-in timestamp hooks. Pair SQL `DEFAULT` with explicit app helpers on write so rows have correct timestamps even if defaults are bypassed, and updates can bump `updatedAt` consistently.

## Skill candidate tag
timestamps-soft-delete

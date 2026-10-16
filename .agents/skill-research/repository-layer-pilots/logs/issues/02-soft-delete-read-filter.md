# Soft-delete filter on every read path

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/repositories/AuditLogRepository.ts`
- Commit: `c86f1f61` — `feat(logs): [WMS-17] Using shared UUID utils`
- Related: `__tests__/AuditLogRepository.test.ts` (soft-delete exclusion tests, commit `207e197b`); `db/schema.ts` index `audit_logs_resource_deletedAt_idx` re-added in `1b795193` after accidental drop in `1012447a`

## Before (rejected / buggy)
Reads without `deletedAt` filter would return soft-deleted rows. Index on `(resource, deletedAt)` was briefly removed during a migration refactor (`1012447a`), weakening filter performance.

## After (accepted / fixed)
```typescript
const filterConditions: SQL[] = [
  eq(auditLogs.resource, resource),
  isNull(auditLogs.deletedAt),
];

// findById / findByIds
.where(and(eq(auditLogs.id, id), isNull(auditLogs.deletedAt)))
```

## Why it matters
Soft-delete is only effective if every repository read path consistently filters `deletedAt IS NULL`. Missing it on one method leaks deleted data; a supporting index keeps filtered scans fast at scale.

## Skill candidate tag
timestamps-soft-delete

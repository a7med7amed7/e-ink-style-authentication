# Composite cursor pagination with tie-breaker key

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/repositories/AuditLogRepository.ts`
- Commit: `c86f1f61` — `feat(logs): [WMS-17] Using shared UUID utils`
- Related: `platform/backend/services/logs/src/db/schema.ts` (`audit_logs_resource_createdAt_id_idx` index, commit `1c988dda`)

## Before (rejected / buggy)
Offset-based or single-column cursor pagination on a non-unique sort column (`createdAt` alone) risks duplicate/missing rows when multiple records share the same timestamp.

## After (accepted / fixed)
```typescript
// DESC seek predicate
cursorPredicate = or(
  lt(auditLogs.createdAt, cursor.createdAt),
  and(eq(auditLogs.createdAt, cursor.createdAt), lt(auditLogs.id, cursor.id))
);

// Query
.orderBy(orderFn(auditLogs.createdAt), orderFn(auditLogs.id))
.fetch(limit + 1);
```

Schema adds composite index `(resource, createdAt, id)` to support the seek.

## Why it matters
Keyset pagination on a non-unique column requires a deterministic tie-breaker (typically the primary key). Fetching `limit + 1` lets the service layer detect a next page without a separate count query.

## Skill candidate tag
cursor-pagination

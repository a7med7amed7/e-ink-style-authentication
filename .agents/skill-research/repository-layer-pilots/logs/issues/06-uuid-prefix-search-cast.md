# Partial UUID search on uniqueidentifier via CAST

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/repositories/AuditLogRepository.ts`
- Commit: `54a4e5dd` — `fix(log): [WMS-19] Adjusting Badr reviews`
- Related: performance TODO documented in `4c6600c2`

## Before (rejected / buggy)
```typescript
if (filters.id) {
  filterConditions.push(eq(auditLogs.id, filters.id));
}
```

Partial UUID input could never match; full UUID required exact string.

## After (accepted / fixed)
```typescript
const fullUuidRegex = /^[a-fA-F0-9]{8}-...-[a-fA-F0-9]{12}$/;
if (fullUuidRegex.test(filters.id)) {
  filterConditions.push(eq(auditLogs.id, filters.id));
} else {
  filterConditions.push(
    like(sql`CAST(${auditLogs.id} AS NVARCHAR(36))`, `${escapedId}%`)
  );
}
```

## Why it matters
`uniqueidentifier` columns do not support prefix `LIKE` directly. CAST to string enables admin prefix lookup but blocks index use — acceptable as a documented trade-off or a signal to add a persisted string column + index.

## Skill candidate tag
uuid-typing

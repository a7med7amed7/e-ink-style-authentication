# Guard findById against invalid ID input

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/repositories/AuditLogRepository.ts`, `GatewayPlatformRepository.ts`
- Commit: `c86f1f61` — `feat(logs): [WMS-17] Using shared UUID utils` (AuditLog)
- Commit: `207e197b` — `refactor(logs): [WMS-17] Refactoring...` (GatewayPlatform int→string guard)

## Before (rejected / buggy)
```typescript
// GatewayPlatformRepository (initial)
async findById(id: number): Promise<...> {
  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }
  // ...
}
```

No guard on AuditLog path sent invalid values to Drizzle/SQL Server.

## After (accepted / fixed)
```typescript
async findById(id: string): Promise<AuditLog | null> {
  if (!id || typeof id !== 'string') {
    return null;
  }
  // ...
}
```

Tests assert `''`, `null`, `undefined`, and numeric coercions all return `null` without a query.

## Why it matters
Repository `findById` should validate input shape before issuing SQL. Early return avoids pointless round-trips and prevents driver errors from malformed route/query parameters.

## Skill candidate tag
uuid-typing

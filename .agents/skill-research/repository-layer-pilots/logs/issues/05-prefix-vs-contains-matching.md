# Identifier prefix match vs text contains match

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/repositories/AuditLogRepository.ts`
- Commit: `54a4e5dd` — `fix(log): [WMS-19] Adjusting Badr reviews`
- Related: design comment added in `4c6600c2` — `fix(log): [WMS-19] Fixing duo reviews on filters`

## Before (rejected / buggy)
```typescript
// All identifier columns used exact eq()
filterConditions.push(eq(auditLogs.entity_id, filters.entity_id));
filterConditions.push(eq(auditLogs.actor, filters.actor));
filterConditions.push(eq(auditLogs.target, filters.target));
```

Administrative UIs typing partial UUIDs got zero results; no distinction between ID lookup and keyword search.

## After (accepted / fixed)
```typescript
// Identifiers: prefix match (index-friendly on nvarchar)
filterConditions.push(like(auditLogs.entity_id, `${escaped}%`));

// Descriptive text: contains match
filterConditions.push(like(auditLogs.entity_name, `%${escapedValue}%`));
```

Documented as intentional: identifiers use `prefix%` or exact `eq`; descriptive fields use `%contains%`.

## Why it matters
Repository filter APIs should document and implement different match strategies per column type. Prefix search on indexed varchar columns is sargable; contains search trades index use for UX on display names.

## Skill candidate tag
like-search

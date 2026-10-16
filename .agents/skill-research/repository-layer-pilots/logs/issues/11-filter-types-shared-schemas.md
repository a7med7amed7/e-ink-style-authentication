# Lift filter interfaces to shared-schemas package

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/repositories/AuditLogRepository.ts`
- Commit: `54a4e5dd` — `fix(log): [WMS-19] Adjusting Badr reviews`
- Related: `@wfe/shared-schemas` import used by HTTP layer and repository

## Before (rejected / buggy)
```typescript
// Defined locally in repository file
export interface AuditLogFilters {
  id?: string;
  entity_id?: string;
  // ...
}
```

Duplicate or divergent filter types between API validation and repository.

## After (accepted / fixed)
```typescript
import { type AuditLogFilters } from '@wfe/shared-schemas';
```

Local `export interface AuditLogFilters` removed.

## Why it matters
Filter/query DTOs shared between HTTP handlers and repositories belong in a shared package so validation schemas and SQL filter builders stay aligned across service boundaries.

## Skill candidate tag
other:shared-schema-types

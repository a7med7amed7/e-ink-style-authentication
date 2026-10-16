# Early return for empty inArray inputs

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/repositories/AuditLogRepository.ts`
- Commit: `c86f1f61` — `feat(logs): [WMS-17] Using shared UUID utils`
- Related: `__tests__/AuditLogRepository.test.ts` — `should return empty array for empty IDs input`

## Before (rejected / buggy)
No `findByIds` method at repository extraction time; callers might pass `[]` to bulk lookups.

## After (accepted / fixed)
```typescript
async findByIds(ids: string[]): Promise<AuditLog[]> {
  if (ids.length === 0) {
    return [];
  }
  return await this.db
    .select()
    .from(auditLogs)
    .where(and(inArray(auditLogs.id, ids), isNull(auditLogs.deletedAt)));
}
```

## Why it matters
`inArray(column, [])` produces invalid or degenerate SQL in many ORMs. Guarding empty arrays at the repository boundary avoids useless queries and driver errors.

## Skill candidate tag
other:guard-empty-inarray

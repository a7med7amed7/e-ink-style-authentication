# Escape LIKE wildcards in user-supplied filter values

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/repositories/AuditLogRepository.ts`
- Commit: `51cd19cc` — `feat(log): [WMS-19] Audit logs - Adjusting Duo reviews 2`
- Related: JSON `JSON_VALUE` filter branches in same commit

## Before (rejected / buggy)
```typescript
filterConditions.push(like(auditLogs.entity_name, `%${filters.entity_name}%`));
filterConditions.push(like(auditLogs.action, `%${filters.action}%`));
// Same for JSON_VALUE paths — raw user input interpolated
```

User input containing `%`, `_`, `[`, or `]` could broaden the match unintentionally or behave as SQL wildcards.

## After (accepted / fixed)
```typescript
const escapedValue = filters.entity_name.replace(/[%_[\]]/g, '[$&]');
filterConditions.push(like(auditLogs.entity_name, `%${escapedValue}%`));
```

Applied consistently to text fields, identifier prefix fields, and `JSON_VALUE` LIKE branches.

## Why it matters
Any repository that builds `LIKE` patterns from request parameters must escape T-SQL wildcard characters or searches become unpredictable and potentially broader than intended.

## Skill candidate tag
like-search

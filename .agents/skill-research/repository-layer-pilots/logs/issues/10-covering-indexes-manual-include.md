# Covering indexes with manual INCLUDE in migration SQL

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/db/schema.ts`
- Commit: `1012447a` — `feat(log): [WMS-19] Audit logs - Adding filters` (indexes added)
- Commit: `9572a411` — `feat(log): [WMS-19] Audit logs - Adjusting Duo reviews` (INCLUDE warning documented)

## Before (rejected / buggy)
Only composite cursor index `(resource, createdAt, id)`. Filter-heavy list queries required key lookups or wide scans for projected columns.

Indexes declared in Drizzle without `INCLUDE` columns — Kit cannot express SQL Server covering indexes natively.

## After (accepted / fixed)
```typescript
index('audit_logs_resource_createdAt_covering_idx').on(t.resource, t.createdAt),
index('audit_logs_resource_actor_createdAt_covering_idx').on(t.resource, t.actor, t.createdAt),
```

With schema comments requiring manual append in `migration.sql`:
```sql
INCLUDE ([id],[actor],[target],[action],[entity_id],[entity_name])
```

## Why it matters
When ORM schema tools lack `INCLUDE`, teams must document and hand-maintain covering indexes in generated SQL. Regenerating migrations without preserving `INCLUDE` silently degrades read performance.

## Skill candidate tag
other:mssql-include-indexes

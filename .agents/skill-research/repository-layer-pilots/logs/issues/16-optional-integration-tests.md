# Optional integration tests with mock fallback for CI

## Service
logs

## Evidence
- File: `platform/backend/services/logs/src/repositories/__tests__/AuditLogRepository.test.ts`
- Commit: `207e197b` — `refactor(logs): [WMS-17]...` (integration suite created)
- Commit: `93f76ddf` — `refactor(logs): [WMS-17]... v2` (DATABASE_URL + crypto mock hoisted)
- Commit: `c96f0fa4` — typed mock `LogsDb` interface

## Before (rejected / buggy)
No repository-level tests, or tests that hard-fail when MSSQL is unavailable in CI.

## After (accepted / fixed)
```typescript
// Hoist env + mock before db client import
process.env.DATABASE_URL = process.env.DATABASE_URL || 'sqlserver://localhost:1434;...';
jest.mock('crypto', () => ({ randomUUID: jest.fn(() => 'mock-uuid-123') }));

// Runtime DB probe
beforeAll(async () => {
  try {
    await pool.connect();
    dbAvailable = true;
  } catch {
    dbAvailable = false;
  }
});

const describeIf = (condition: boolean) => (condition ? describe : describe.skip);
describeIf(dbAvailable)('with database connection', () => { /* integration */ });
describe('without database connection', () => { /* mock Drizzle chain */ });
```

## Why it matters
Repository integration tests against real MSSQL catch UUID, pagination, and soft-delete bugs mocks miss. Probing connectivity and providing a mock path keeps CI green while enabling full tests locally.

## Skill candidate tag
other:optional-integration-tests

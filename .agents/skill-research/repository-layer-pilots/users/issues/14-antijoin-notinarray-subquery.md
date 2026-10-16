# Anti-join via `notInArray` subquery

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/UserRepository.ts`
- Commit: `c5a63ac8` — feat: Schedulers (OTP + temp-pw cleanup)
- Commit: `5f4955aa` — feat(users): [WMS-373] user org invitation approval flow
- Commit: `8f68e2dc` — feat(users): [WMS-499] add needed workflows endpoints

## Before (rejected / buggy)
Scheduler cleanup needed users without active temp passwords — no query existed. Available-user picker filtered only by org type on join, not active assignment state.

## After (accepted / fixed)
Drizzle subquery passed to `notInArray`:

```typescript
const activeIds = this.db
  .select({ user_id: tempPasswords.user_id })
  .from(tempPasswords)
  .where(eq(tempPasswords.expired, false));

const rows = await this.db
  .select({ id: users.id })
  .from(users)
  .where(and(
    isNull(users.deletedAt),
    eq(users.is_verified, false),
    eq(users.is_temp, true),
    eq(users.is_invited, true),
    notInArray(users.id, activeIds)
  ));
```

Assignment availability uses same pattern — users not in `assignedToAnyOrg` subquery with active dept/org filters (`5f4955aa`, `8f68e2dc`).

## Why it matters
“Not assigned to X” and “no active child row” are common filters. Subquery + `notInArray` avoids loading ID lists into memory and prevents N+1 per candidate.

## Skill candidate tag
batching-n1

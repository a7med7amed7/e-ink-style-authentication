# Expire-existing before create (single-use token pattern)

## Service
users

## Evidence
- File: `modules/users/backend/src/repositories/OtpRepository.ts`
- Commit: `afce75f8` — Replace Prisma with Drizzle
- File: `modules/users/backend/src/repositories/TempPasswordRepository.ts`
- Commit: `afce75f8` — Replace Prisma with Drizzle

## Before (rejected / buggy)
Prisma `updateMany` to expire prior codes:

```typescript
await this.prisma.authorizationCode.updateMany({
  where: { user_id: userId, type, expired: false },
  data: { expired: true },
});
```

No `touchUpdatedAt` on expire path in Prisma era.

## After (accepted / fixed)
Explicit expire method called before each create (service layer orchestration):

```typescript
async expireExisting(userId: string, type = 'email_verification') {
  await this.db
    .update(authorizationCodes)
    .set({ expired: true, ...touchUpdatedAt() })
    .where(and(
      eq(authorizationCodes.user_id, userId),
      eq(authorizationCodes.type, type),
      eq(authorizationCodes.expired, false)
    ));
}
```

`TempPasswordRepository.expireExisting` mirrors pattern. `findLatestValid` uses `.top(1).orderBy(desc(createdAt))`.

## Why it matters
OTP/temp-password tables need at-most-one active row per user+type. Skill should document expire-then-insert as standard uniqueness strategy without DB unique partial indexes.

## Skill candidate tag
upsert-uniqueness

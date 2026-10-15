# Phase 2 PasswordService lane

Status: T024/T027 implementation and focused checks pass.

Owned files: `apps/api/test/password.service.test.ts`, `apps/api/src/security/password.service.ts` only.

The tests first ran before the implementation. K024 failed at the intended missing-module boundary (`TS2307: Cannot find module '../src/security/password.service.js'`), so the RED was specific to the absent service entry point. After implementation, the service test suite passed 3/3 with native Argon2.

`PasswordService.create(hashWork)` precomputes one dummy verifier from 32 random bytes through the supplied HashWork. `hash(canonicalPassword)` uses Argon2id with 19,456 KiB, time cost 2, parallelism 1, and 32-byte output; it omits `salt`, so argon2 generates a fresh random salt. `verify(storedHash, canonicalPassword)` verifies the stored encoded parameters through HashWork. `verifyDummy(canonicalPassword)` verifies the one precomputed dummy verifier through the same gate and always returns false. The dummy verifier stays private.

Verification evidence, with `PATH=/tmp/easygen-node-v24.22.0/bin:$PATH`:

- K024 pre-implementation RED: exit 1, expected TS2307 missing-service diagnostic.
- K027 exact command (`npm run build:test:api -- apps/api/test/password.service.test.ts && node --test --test-name-pattern='password-service:' apps/api/dist-test/targets/password.service.test/test/password.service.test.js`): exit 0, 3 tests passed.
- Targeted ESLint on both owned files: exit 0.
- `npm run typecheck --workspace @easygen/api`: exit 0.

No task checkboxes or commits were changed.

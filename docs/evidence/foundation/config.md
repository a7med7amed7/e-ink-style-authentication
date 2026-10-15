# Phase 2 configuration lane report

## Scope

Owns `apps/api/test/config.test.ts` (T018) and `apps/api/src/config.ts` (T021). `parseConfig(env)` returns a readonly, runtime-frozen `ApiConfig` with explicit `NODE_ENV`, canonical `APP_ORIGIN`, MongoDB URI/database name, canonical base64 `SESSION_SECRET`, private `HOST`, numeric `PORT`, and a frozen trusted-proxy list.

## TDD and verification

The original K018 attempt failed at the expected missing `../src/config.js` import. Initial K021 passed 8/8 for required values, secret strength, canonical origins, Mongo URI/port, private bind, and frozen settings. The follow-up broad-proxy correction extended the narrow-proxy test first and ran focused K021 against the old parser. It failed for the intended behavior: `Missing expected exception: 10.0.0.0/8`.

The parser now accepts literal IPv4/IPv6 proxy addresses and CIDRs with at least `/24` for IPv4 or `/64` for IPv6, rejecting less-specific prefixes. The tests reject `/1`, `/8`, `/23`, `/0`, IPv6 `/32` and `/63`; they accept exactly `/24`, `/64`, and literal addresses for both families.

K021 command:

```sh
PATH=/tmp/easygen-node-v24.22.0/bin:$PATH npm run build:test:api -- apps/api/test/config.test.ts && PATH=/tmp/easygen-node-v24.22.0/bin:$PATH node --test --test-name-pattern='config:' apps/api/dist-test/targets/config.test/test/config.test.js
```

Result: exit 0, 8/8 tests passed. Targeted ESLint for `apps/api/src/config.ts` and `apps/api/test/config.test.ts` also exited 0.

## Remaining housekeeping

`apps/api/src/config.ts` is 246 lines, above the 100-line per-source-file task cap; root owns the requested file-splitting/task bookkeeping. README configuration documentation should state the accepted minimum prefix widths. No task boxes were changed and no files were committed.

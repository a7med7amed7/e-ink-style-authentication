# Phase 8 tooling: T123–T126

## T123 — exact E2E database cleanup

`playwright.config.ts` now creates one UUID per Playwright run, derives the database name from that UUID, stores both in runner metadata, and passes the same exact loopback URI to the API web server. Global teardown reads the resolved `FullConfig`; it requires a canonical generated UUID, the exact derived `easygen_e2e_[0-9a-f]{32}` database name, and the matching credential-free `mongodb://127.0.0.1:27017/<database>` URI before constructing a Mongo client. It drops only that database and closes the client in `finally`. Focused unit tests reject mismatched/caller-selected and remote targets before client creation and verify close on success, connect failure, and drop failure.

K123 baseline ran the existing auth E2E test in the pinned browser container before teardown existed: **2/2 passed**, and Mongo showed the newly generated exact E2E database remained. That one exact observed database was dropped manually and verified absent. After implementation, the same Chromium auth run passed **2/2**; the E2E database list was empty before and after. A temporary assertion-failure spec then exited **1** on its intended failed assertion; global teardown still ran and the E2E database list was empty afterward. The temporary spec was removed. No prefix-based deletion was used.

The successful-run command was the pinned Playwright container invocation:

```sh
docker run --rm --platform linux/amd64 --ipc=host --network=host \
  --mount type=bind,source=/home/ahmed/projects/easygen_assessment,target=/workspace,readonly \
  --mount type=bind,source=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0,target=/opt/node,readonly \
  --workdir /workspace \
  -e PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf \
  /opt/node/bin/node node_modules/@playwright/test/cli.js test tests/e2e/auth.spec.ts \
  --project=chromium --output=/tmp/pw-t123-green
```

The failure-path invocation used the same command with `tests/e2e/database-cleanup-failure.spec.ts` and `--output=/tmp/pw-t123-failure`; that file only contained the deliberate failing assertion and was removed immediately afterward. The verification command for database absence was:

```sh
docker exec easygen_assessment-mongo-1 mongosh --quiet --eval \
  'db.adminCommand({listDatabases:1}).databases.map((entry) => entry.name).filter((name) => /^easygen_e2e_/.test(name))'
```

It returned `[]` after the successful auth run, after the deliberate failing run, and after the final three-browser Unicode run. The Mongo inspection only listed matching names; it did not delete by prefix.

## T126 — cleanup guard tests

`node --test tests/unit/database-cleanup.test.ts` on Node 24.22.0 passed **3/3**. The cases cover exact runner-owned target selection, fail-closed mismatch/remote/userinfo cases before client creation, and client closure after connect/drop failure.

Execution deviation: the test-only `tests/unit/database-cleanup.test.ts` file was added during T123 before requesting a scope split. Root recorded T126 afterward; this report does not claim the split preceded the test file.

## T124 — strict aggregate E2E typecheck

`tsconfig.e2e.json` extends the shared strict base and includes `playwright.config.ts`, all `tests/e2e/**/*.ts`, and the cleanup helper test at `tests/unit/**/*.ts`; it sets `noEmit` and permits explicit TypeScript imports for Node's test runner. Root `typecheck` now runs workspace typechecks and then `typecheck:e2e`.

The initial direct strict typecheck found **one** `TS4111` for `MONGODB_URI` property access in the cleanup helper. It was corrected to bracket access. `npm run typecheck:e2e` then passed. K124 exact command `PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH npm run typecheck` passed with exit code 0 across API, web, auth-contract, and E2E TypeScript. After later T102/T128 source edits, the E2E-only strict command passed again; the root aggregate command is left for the final coordinated gate after those edits.

All browser evidence here is from linux/amd64 with the pinned Playwright image and Node 24.22.0/npm 11.19.1. It does not establish Windows, macOS, or arm64 behavior.

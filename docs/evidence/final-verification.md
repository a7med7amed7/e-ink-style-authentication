# Final verification

**Current result: fresh verification and image smoke passed for committed HEAD `e842bb5cdb5ae33ca6f87b93ad05cc283fc85b96` on Linux/amd64.** This records those technical gates; it does not claim target-hardware performance, screen-reader speech, public source publication, production deployment, or non-Linux/amd64 support.

## Pre-T135 committed-snapshot result

The earlier 294/294 run for `9818d60b6cd75511695543b306c5aa72672c7d87` is retained only as historical pre-T135 evidence at `/home/ahmed/.cache/easygen-qa/final-verification-9818d60/`; T135 corrected validation that had incorrectly accepted `fc::1` and `fd1::1` as private even though they are outside `fc00::/7`.

T135's focused IPv6 bind regression suite passed 8/8 on the fixed source; its raw log is `/home/ahmed/.cache/easygen-qa/repro-phase8/logs/phase9/k135-post-t135.log`.

## Clean snapshot and aggregate verification

`git archive` of `e842bb5cdb5ae33ca6f87b93ad05cc283fc85b96` produced 200 tracked files, with no `.env`, `node_modules`, or `dist` paths. Archive SHA-256: `85871f0feb17c75f953cdbd20548777c4240198a0cb5cc36b2d692bc40e9c601`. SHA-256 of the sorted per-file tree manifest: `3de9d14ecaba5802ca129a48e157e959f49b391b0a520ad236b9b52cbf14329b`.

A fresh `npm ci` passed as UID 1000 in the pinned Playwright container using Node `v24.22.0` and npm `11.19.1`: 364 packages installed and zero vulnerabilities. `npm run db:up` reused the existing baseline Mongo service; its full container ID `7187768d9908c40d2ebbdece57270db297461d165e4c861359f5ef3a3f5d26fc` remained unchanged and healthy.

The aggregate `npm run verify` passed with exit 0 in `mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf`, Linux/amd64, UID 1000, host networking, and `--ipc=host`; the Node toolchain mount was read-only. Node reported `v24.22.0`, npm `11.19.1`, and ICU `78.3`. Counts were 294 passed, 0 failed, 0 skipped: shared 54, web 109, API 69, tooling 3, real-Mongo integration 35, and browser suites accessibility 15, auth 6, Unicode 3. Browser versions were Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2. Lint, strict workspace/E2E typechecks, and the production build are included in this command.

The command output and exit record are in `/home/ahmed/.cache/easygen-qa/final-verification-e842bb5/verify.log` and `verify.exit`; `npm ci`, source archive/tree hashes, `npm run db:up`, and cleanup records are alongside them. After verification, exact `easygen_e2e_*`/`easygen_test_*` database inspection returned `[]`, port 4173 was free, and baseline Mongo remained healthy with the same ID.

## Current Linux/amd64 image and runtime smoke

From that same committed snapshot, `docker build --platform linux/amd64 --iidfile /home/ahmed/.cache/easygen-qa/final-verification-e842bb5/image.iid -t easygen-auth:final-e842bb5 /home/ahmed/.cache/easygen-qa/final-verification-e842bb5/source` exited 0. The image is `sha256:a5da21d8cbe9a4132feb551de1834d7da78bc279711df3893faf39f6f7cacbaa`, 260,132,325 bytes, Linux/amd64, configured user `node`, command `node apps/api/dist/main.js`. Full output and metadata are in `docker-build.log` and `image-metadata.txt` in the QA cache.

The image loaded native Argon2 and completed hash/verify as UID 1000 with Node `v24.22.0`, `linux/x64`, and networking disabled (`native-argon2-smoke.json`: `argon2Loaded: true`, `verify: true`). A bounded HTTP smoke then ran this image as UID 1000 with Linux host networking, `HOST=127.0.0.1`, free loopback port 44543, `NODE_ENV=test`, a fresh `easygen_test_e3a10a7393c87ef5ebc17170d597e368` Mongo database, and a randomly generated session secret supplied through the runtime environment without logging its value. It confirmed the SPA root and `/signin` fallback returned 200, an unknown `/api` path returned JSON 404, and anonymous `/api/auth/me` returned JSON 401. It did not inspect or persist the secret. This host-network harness is distinct from the prior private-bridge Compose proof and did not modify host firewall rules.

The smoke container `1c01887e54fdcbc7e4a9d079179c20e50b0cdd94af63d56c72e9d4d2bcea9127` was removed. The exact test database query returned `[]`; port 44543 and the E2E port 4173 were free; the baseline Mongo container remained unchanged and healthy. Results and cleanup evidence are in `http-smoke.log`, `http-smoke-cleanup.txt`, `http-smoke-db-final.txt`, `http-smoke-port-final.txt`, and `baseline-mongo-final.txt` under the QA cache.

These runs verify the committed Linux/amd64 source and local Docker/Mongo conditions. T101 actual Orca field/error speech and T116 public source publication remain open. Deployment-target performance, production HTTPS/proxy deployment, and non-Linux/amd64 operation remain unverified.


## Historical T136 local Docker convenience

T136 adds the documented one-command launch with an automatically generated persistent local session key and optional network defaults. Root reviewed the Compose/documentation change; application sources, dependencies and production Dockerfile are unchanged. [Focused Docker evidence](local-docker-launcher.md) records configuration, key reuse/permissions/override tests, isolated HTTP startup and cleanup. The normal bridge launch still encounters this host's existing firewall restriction. The earlier 294-test result remains tied to its recorded application revision; it is not a new test run for this launcher change. T101/T116 and other platform/deployment limits remain unchanged.


## Verified default Docker startup (T137)

The previous T136 bridge limitation is resolved in the local default by sharing Mongo's network namespace while retaining separate containers. The app connects to namespace loopback; only host loopback HTTP port 3000 is published. The exact documented Compose command exited 0 repeatedly on the user's default project without any host firewall change. Actual signup, authenticated identity, logout, Mongo/app restart with session persistence, and original-volume/key preservation passed. Root independently inspected the live healthy containers and HTTP status. The app stack remains running; disposable test accounts were removed. See [T137 evidence](local-docker-startup-fix.md) and [independent review](local-docker-startup-fix-review.md). Production runtime code and Dockerfile are unchanged; the earlier 294-test application result is not a new suite run for this Compose change. Existing external delivery and untested-platform limits remain explicit.


## Inline password and field validation follow-up (T138–T141)

The user-authorized presentation update replaces the external text toggle with an accessible inline icon and renders one bullet per message in one list below each field, without a duplicate validation summary. Focused forms29/29, component3/3, full web114/114, lint, typecheck, build, and pinned three-engine accessibility15/15 passed. These are focused follow-up checks; the earlier294-test result remains historical. See [follow-up evidence](inline-fields.md) for the reviewed changes, actual local Docker verification, and scope limits. No database, API, environment, dependency or migration changed; WFE-specific gates remain inapplicable as documented above.

# Phase 8 documentation and clean-reproduction lane

## T107 evidence release and sequence

T107 private ingress/authentication smoke passed on Linux/amd64 after a narrowly scoped, temporary host firewalld allowance. The native image loaded, the app ran as `node` on Node 24.22.0, the app health endpoint and SPA returned 200, signup returned 201, and cookie-authenticated `/api/auth/me` returned 200 through the published loopback path. A source-matched same-bridge `NEW` TCP/27017 rule was inserted ahead of the nested reject; it counted 4 packets / 240 bytes, then the rule and app QA resources were removed. The pre-existing baseline Mongo service/volume remained intact. The unmodified host firewalld policy had rejected the app-to-Mongo connection, so the evidence does not claim out-of-box behavior for that host policy or universal Docker/OS support. See `docs/evidence/container.md` for the owner's command-level record when written.

This lane owns the T108–T112 documentation and reproduction evidence; root separately recorded and authorized T132's two package-script prerequisites. No spec/task-plan file is owned here, and no benchmark artifact is overwritten. README setup/security/capacity sections and `AI.md` history are complete; T112 clean-snapshot verification passed on the refreshed source tree, with exact evidence below.

Use `/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin` (Node 24.22.0, npm 11.19.1) for recorded project checks. Keep each delegated task within two owned source/config files and 100 added production lines; documentation lines do not count as production code. No task-plan edits, staging, commits, or publication in this lane.

## Compact documentation checklist

- **T108 / K108:** prerequisites and exact versions; secret generation and required env values; startup/index readiness; safe local Mongo and Vite `/api` proxy commands; `npm run typecheck`, `npm run lint`, `npm run build`; distinguish real integration tests from skips. Match the eventual Docker workflow to T107 evidence. Production guidance must state one same-origin HTTPS origin, explicit `APP_ORIGIN`, proxy-overwrite/trusted-CIDR assumptions, private backend reachability, and actual IP-validation scope.
- **T109 / K109:** email normalization plus real unique-index enforcement; duplicate registration's 409 enumeration tradeoff; passwords are NFC-only and count Unicode code points after NFC (signup 8–128 with L/Nd/P-or-S rules and Cc/Cf/Cs/Zl/Zp rejection; signin required/max 128 only); tested Node/ICU and browser versions and Unicode-version limits; session cookie, 30-minute idle and 8-hour absolute limits; CSRF/origin rules; per-IP limits; no automatic signup/signin POST retry; partial signup/session-save failure, lost-response recovery by normal signin, and generic 401 versus 503; distinguish `/me` anonymous observation from acknowledged logout invalidation.
- **T110 / K110:** hash gate is 2 active, 4 waiting, 1000 ms maximum wait; document per-IP limits and single-process scope. The original native report records Linux x64 / Ryzen 5 4500U / Node 24.22.0 / ICU 78.3, two-active service p95 40.412917 ms, baseline/peak RSS 94,715,904 / 136,658,944 bytes, saturation, and four waiters expiring at 1001.423789 ms. The constrained report records one-CPU quota / 536,870,912-byte limit, two-active service p95 83.297532 ms, and baseline/peak RSS 92,663,808 / 134,737,920 bytes. Both target markers are `unverified`; the 1-vCPU/512-MiB deployment target and <500 ms target objective remain unverified. Explain older unacknowledged server work, 5-second “Still verifying” as UI-only, reconciliation limits, no cross-tab ordering, no Redis/distributed admission, and deferred backups, monitoring, redundancy, email verification, account recovery, and deployment automation. K110 also requires one stdout-only benchmark documentation check captured under `/tmp`, without overwriting the T105 JSON.
- **T111 / K111:** extend the existing Phase 1–7 AI log with actual Phase 8 work, observed corrections (including Firefox isolated-surrogate NFC behavior), real verification outcomes, and limits. Do not invent prompts, rejected suggestions, tests, platform coverage, performance, or publication.
- **T112 / K112:** from an isolated clean source snapshot with no secrets or hidden workstation state, follow the documented quickstart, run `npm ci`, start the documented Mongo service, and execute the full `npm run verify` path. Capture exact commands, runtime/image/architecture, test counts and skips, build/typecheck/lint results, and E2E cleanup. Any concrete suite failure must be reported to root before changing fixtures or the runner.

## Evidence and limits already available

T123/T126 evidence records exact per-run E2E database cleanup (including a deliberate failing run) and 3/3 cleanup-unit tests. T124 records strict E2E inclusion in aggregate typecheck. T102/T128 records shared Unicode fixture coverage and 54/54 shared tests plus final Chromium/Firefox/WebKit 3/3, on Linux amd64 only. T105 records one native benchmark sample; it must not be rerun for these docs. Read `.superpowers/delegated-execution/phase8-tooling.md`, `phase8-unicode.md`, `phase8-benchmark.md`, `phase8-review.md`, `specs/001-user-auth/implementation-contract.md` C14, `specs/001-user-auth/contracts/deployment.md`, and `specs/001-user-auth/tasks.md` T108–T112 before editing.

The accessibility evidence at `docs/evidence/accessibility.md` explicitly leaves actual Orca field/error speech unverified; T101 remains an open delivery gap. Browser semantics, visual checks, or documentation cannot close it. Public GitHub publication is also not authorized or available from the current workspace state; do not publish or reopen that question in this lane.

## Completion discipline

`verification-before-completion` requires fresh command output before any pass/completion claim. `pre-push-branch-readiness` is relevant only if root later asks for push/readiness; its MSSQL/Drizzle gates do not apply to this authentication repository. README documentation and T112 clean-source verification are complete; final review and repository integration remain with root.

## T130 execution record

`package.json` now has `test:unit:tooling` for the existing cleanup guard test and appends it to `test:unit`; the existing T124 `typecheck:e2e` changes were preserved. The initial K130 aggregate exposed an API benchmark test that walked from the full test output to `apps/dist`, while the focused K103 layout had passed only because a production API build artifact already existed. The root cause and two test compilation layouts were reported to root before changing the separate T103-owned test. That test now includes the inert CLI in its compilation graph and imports the emitted sibling at `../src/benchmark-hash.js`, independent of production `dist`.

Under the pinned Node 24.22.0/npm 11.19.1 PATH, focused K103 passed **4/4**, zero skips; `npm run test:unit:api` passed **69/69**, zero skips. Final K130 (`npm run test:unit:tooling && npm run test:unit`) passed: direct cleanup guard **3/3**; aggregate shared **54/54**, web **105/105**, API **69/69**, and aggregate cleanup guard **3/3**; zero failures and zero skips in each. No benchmark run was performed. T130 is complete subject to root's review.

## Combined E2E limiter check

Before the full run, Mongo `easygen_assessment-mongo-1` was healthy (`ping` returned `{ ok: 1 }`) and port 4173 had no listener. Node/npm were 24.22.0/11.19.1. One all-project invocation used the pinned Playwright `linux/amd64` image, readonly source and toolchain mounts, `--network=host`, and output under `/tmp`:

```sh
docker run --rm --platform linux/amd64 --ipc=host --network=host \
  --mount type=bind,source=/home/ahmed/projects/easygen_assessment,target=/workspace,readonly \
  --mount type=bind,source=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0,target=/opt/node,readonly \
  --workdir /workspace \
  -e PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf \
  /opt/node/bin/node node_modules/@playwright/test/cli.js test --output=/tmp/pw-phase8-full-e2e
```

Result: **23/24 passed**, zero skipped; exit 1. Chromium and Firefox auth/Unicode cases passed. WebKit accessibility and auth cases passed. The final WebKit Unicode case's real signup request returned **429** where it expected **201**. This is the sixth accepted signup attempt within the same Playwright run and confirms the shared app's 5-per-IP/15-minute limiter collides across the three-engine auth and Unicode files. The generated E2E database was absent after teardown (`[]`), and port 4173 was free after exit.

Root was notified before any fixture/runner change. Root recorded T131 before implementation: a sequential Node runner discovers each `tests/e2e/*.spec.ts`, invokes each file in a fresh Playwright process with the selected browser projects, preserves separate output directories, rejects unknown/filtering arguments, and stops on the first nonzero status. Each invocation starts a new app limiter and generated database and runs the existing exact teardown. `test:e2e` uses build plus this runner; `verify` invokes it after its existing build. The runner is 84 lines.

K131 build ran on the host with the persistent Node 24.22.0/npm 11.19.1 toolchain because the browser container source mount is readonly: `PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH npm run build` exited 0. `PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH node --check scripts/run-e2e.mjs` exited 0. Then the pinned browser image ran the runner against that fresh build:

```sh
docker run --rm --platform linux/amd64 --ipc=host --network=host \
  --mount type=bind,source=/home/ahmed/projects/easygen_assessment,target=/workspace,readonly \
  --mount type=bind,source=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0,target=/opt/node,readonly \
  --workdir /workspace \
  -e PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf \
  /opt/node/bin/node scripts/run-e2e.mjs --output=/tmp/pw-phase8-k131
```

It discovered and executed all **24** tests in **3** Playwright invocations: accessibility **15/15**, auth **6/6**, Unicode **3/3**; all three configured browser projects ran in every invocation, with zero failures or skips. Node 24.22.0/ICU 78.3 and Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2 were observed in the Unicode run. After all three normal teardowns, the Mongo inspection returned `[]` for `easygen_e2e_*`; port 4173 was free. No limiter, fixture, or POST retry behavior was changed.

## T108–T110 documentation and checks

`README.md` now covers the exact Node/npm versions, secret and environment setup, direct-host Mongo/Vite workflow, local HTTP app Compose workflow, startup index readiness, real integration/E2E commands, and platform scope. T107 evidence is described with its host firewalld prerequisite: the app service health check passed, app/SPA and loopback HTTP checks returned 200, signup returned 201, and cookie-authenticated `/api/auth/me` returned 200. On this host the nested forward reject blocked a new bridge flow until QA installed a source/destination/protocol-scoped allow ahead of the policy; its counter was 4 packets/240 bytes and cleanup restored the original firewall rules. The README neither says the unmodified host policy works nor generalizes Docker support beyond Linux/amd64.

The sequential C14 sections document canonical email/indexed uniqueness and the 409 enumeration tradeoff; Unicode NFC/code-point/composition rules and tested Node/ICU/browsers; production cookie/origin/proxy assumptions plus the exact scope of local trusted/untrusted socket tests; persisted sessions, idle/absolute deadlines, 503 failure semantics, anonymous `/me` versus confirmed destroy, partial signup recovery and no POST retry; per-route rate limits, hash gate and benchmarks; stale server-work/cross-tab limits; and deferred ops.

K108 ran under the persistent pinned runtime and all three commands exited 0:

```text
PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH npm run typecheck
PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH npm run lint
PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH npm run build
```

K109 ran against the healthy, separate baseline Mongo service: `PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH npm run test:integration` passed **34/34**, zero skipped; `PATH=/home/ahmed/.cache/easygen-toolchain/node-v24.22.0/bin:$PATH npm run test:unit --workspace @easygen/auth-contract` passed **54/54**.

The checked-in raw reports remain the original T105 native sample and T107 constrained sample, untouched by the documentation check. Their exact two-active service p95/RSS observations are respectively **40.412917 ms** and **83.297532 ms**, with baseline/peak RSS **94,715,904 / 136,658,944 bytes** and **92,663,808 / 134,737,920 bytes**. The resource-limited container used quota `100000 100000` and 536,870,912 bytes; the native host cgroup limits were unavailable. Both artifacts mark the target unverified.

K110 ran one native `npm run benchmark:hash` and captured all command output to `/tmp/phase8-docs-k110.out`; the parsed copy is `/tmp/phase8-docs-k110.json`. Neither `docs/evidence/hash-benchmark.json` nor the constrained report was overwritten. The K110 two-active result was service p95 **36.933503 ms**, admitted p95 **36.996400 ms**, baseline/peak RSS **94,330,880 / 136,273,920 bytes**, four waiters timed out at **1001.566772 ms**, and the target remained explicitly unverified.

T111 extends `AI.md` with actual Phase 8 interventions, the combined-run 429 finding and isolated-runner correction, Firefox's isolated-surrogate behavior and repair, Docker firewall diagnosis/scope/cleanup, K108–K110 exact results, and remaining verification limits. Read-only C14 review found no coverage gaps and corrected one benchmark sentence: the constrained container report shares the reported Ryzen 5 4500U / Node / ICU version while applying its cgroup limits; README now states this precisely.

## T132 clean-check root-cause correction

The first fresh-source T112 attempt used tree `67c213c18652216c3ac49e5c26dc8fb45501e752` after `npm ci` with no existing shared output. `npm run verify` stopped at its first `eslint .` step with **210** error-typed diagnostics across API/web files. The shared package's `types`/exports point to `packages/auth-contract/dist/index.d.ts`, which was absent after install. In that same snapshot, `npm run build:shared` followed by root lint and typecheck passed. T132 was recorded before editing; `package.json` now has only `prelint` and `pretypecheck` hooks that build the shared declarations. No dependency, lint rule, type rule, or production `prepare` hook changed.

K132 was rechecked with exact Node 24.22.0/npm 11.19.1 in the fresh-npmci snapshot. With `packages/auth-contract/dist` absent, `npm run lint` visibly ran `prelint -> build:shared -> eslint .` and exited 0. After deleting only that generated output again, `npm run typecheck` ran `pretypecheck -> build:shared -> API, web, shared, and E2E typechecks` and exited 0. The failed full-run log remains preserved separately; it is not counted as a pass.

## T112 refreshed clean-source reproduction

Root staged the final source paths into tree `0a19bd0e18772a478f4225c3f472d2cb39019b3f` and archive `/home/ahmed/.cache/easygen-qa/repro-phase8/source-0a19bd0e18772a478f4225c3f472d2cb39019b3f.tar`, SHA-256 `5f00cbf27151d094579e6d1494b5be8eb14bdb85ae0b332b0bdd45dd117ddf23`. A new empty snapshot leaf `easygen_assessment`, UID/GID 1000, began without `.env`, `node_modules`, or any build/test output. Exact Node 24.22.0/npm 11.19.1 `npm ci` added 364 packages, audited 368, and found zero vulnerabilities. `npm run db:up` reused the existing healthy Mongo container and volume without reset.

The full `npm run verify` command ran in `mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf` with Node 24.22.0, npm 11.19.1, Linux/amd64, `HOME=/tmp`, UID 1000, and the mounted snapshot writable. It exited 0: lint, strict root/workspace/E2E typechecks and production build passed; units were shared **54/54**, web **105/105**, API **69/69**, tooling **3/3** (231 total); real-Mongo integration **34/34**; browser specs were accessibility **15/15**, auth **6/6**, Unicode **3/3** in three fresh invocations, all with zero failures or skips. Browser versions were Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2; Node reported ICU 78.3. Total: **289 passed, 0 failed, 0 skipped**.

From the same snapshot, `docker build --platform linux/amd64 -t easygen-auth:assessment .` exited 0 and produced `sha256:63019d644cd837ce300dfa3323ed8e68580b720576d0b0ec967d5055467f7aff`, user `node`. A native Argon2 hash/verify smoke passed in the image under Node 24.22.0/UID 1000. The exact Docker-only secret generator from README was piped through an in-memory validator; it checked as 32-byte canonical base64 without logging or saving the value.

After the suites, the Mongo database-name query returned `[]` for `easygen_e2e_*` and `easygen_test_*`; the baseline Mongo ID and volume remained unchanged/healthy, `.env` remained absent, and port 4173 was free. Full command output is preserved under `/home/ahmed/.cache/easygen-qa/repro-phase8/logs/`; `docs/evidence/reproducibility.md` records the archive, command, test, image, and cleanup details. This proves only the observed Linux/amd64 and pinned runtime/browser environment; T101 actual Orca field/error speech, T116 publication, other host OS/architectures, deployment and target hardware remain open/unverified.

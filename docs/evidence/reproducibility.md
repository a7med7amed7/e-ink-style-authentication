# Clean-source reproduction

T112 ran from a new extraction of source tree `0a19bd0e18772a478f4225c3f472d2cb39019b3f`, archived at `/home/ahmed/.cache/easygen-qa/repro-phase8/source-0a19bd0e18772a478f4225c3f472d2cb39019b3f.tar` (SHA-256 `5f00cbf27151d094579e6d1494b5be8eb14bdb85ae0b332b0bdd45dd117ddf23`). The writable snapshot is `/home/ahmed/.cache/easygen-qa/repro-phase8/snapshot-0a19bd0e18772a478f4225c3f472d2cb39019b3f-clean/easygen_assessment`, owned by UID/GID 1000. After extraction it had no `.env`, `node_modules`, `dist`, API/web build output, API test output, or shared-contract declarations.

The exact toolchain was Node v24.22.0 and npm 11.19.1. The host reported Docker Compose v2.29.2-desktop.2 and Docker client/server 28.3.1/29.8.0. The clean `npm ci` used the lockfile and a reusable npm content cache; it added 364 packages, audited 368, and reported zero vulnerabilities. `docker compose config --quiet` passed, and `npm run db:up` reported the Mongo service healthy. It reused the existing `easygen_assessment-mongo-1` container (ID `7187768d9908c40d2ebbdece57270db297461d165e4c861359f5ef3a3f5d26fc`) and `easygen_assessment_mongo-data` volume without resetting them.

The complete verification ran in the pinned Playwright image on Linux/amd64, with the pinned Node installation mounted read-only, the snapshot writable by UID 1000, `HOME=/tmp`, and host networking for this Linux QA adapter to reach the existing Mongo service and browser-test ports:

```sh
docker run --rm --platform linux/amd64 --network host --ipc host --user 1000:1000 \
  -e HOME=/tmp \
  -e PLAYWRIGHT_BROWSERS_PATH=/ms-playwright \
  -e PATH=/opt/node/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin \
  -v /home/ahmed/.cache/easygen-toolchain/node-v24.22.0:/opt/node:ro \
  -v /home/ahmed/.cache/easygen-qa/repro-phase8/snapshot-0a19bd0e18772a478f4225c3f472d2cb39019b3f-clean/easygen_assessment:/workspace \
  -w /workspace \
  mcr.microsoft.com/playwright@sha256:7852dc5a7d72f5fe458a597d690f6c42fbc8e9e26ddfa95f8e6ef552558d9bbf \
  /opt/node/bin/npm run verify
```

The command exited 0. Lint, root/workspace/E2E typechecks, and all three production builds passed. The unit groups passed with no skips: shared contract 54/54, web 105/105, API 69/69, and database-cleanup tooling 3/3 (231 total). Real-Mongo integration passed 34/34 with no skips. The runner discovered every browser spec and used a fresh Playwright application process per spec: accessibility 15/15, auth 6/6, and Unicode 3/3. All 24 browser tests passed with no skips across Chromium 156.0.8078.4, Firefox 157.0, and WebKit 27.2; Node reported ICU 78.3. The complete test total was 289 passed, zero failed, zero skipped.

The verification output is preserved at `/home/ahmed/.cache/easygen-qa/repro-phase8/logs/verify-0a19bd0e18772a478f4225c3f472d2cb39019b3f.log`. The first clean-source attempt is also retained at `/home/ahmed/.cache/easygen-qa/repro-phase8/logs/verify-67c213c18652216c3ac49e5c26dc8fb45501e752-failed.log`; it stopped at lint with 210 error-typed diagnostics. Fresh install left `packages/auth-contract/dist` absent, while the package exports declarations from that directory. Building only the shared package made lint and typecheck pass. T132 then added root `prelint` and `pretypecheck` scripts to build those declarations before typed checks. Both standalone commands were verified again from absent shared `dist`; the refreshed source snapshot's complete run above confirms the final fix. No TypeScript `prepare` hook or lint/type rule change was added.

From the same clean snapshot, `docker build --platform linux/amd64 -t easygen-auth:assessment .` exited 0. The image is `sha256:63019d644cd837ce300dfa3323ed8e68580b720576d0b0ec967d5055467f7aff`, Linux/amd64, and runs as `node`. It uses `node:24.22.0-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5`. A container smoke test loaded native Argon2, hashed and verified a non-secret fixture value, and exited 0 under Node v24.22.0 with UID 1000; the output is at `/home/ahmed/.cache/easygen-qa/repro-phase8/logs/argon2-smoke-0a19bd0e18772a478f4225c3f472d2cb39019b3f.log`. The build output is at `/home/ahmed/.cache/easygen-qa/repro-phase8/logs/docker-build-0a19bd0e18772a478f4225c3f472d2cb39019b3f.log`.

The Docker-only secret-generator command in the README was piped directly into an in-memory validator; it produced 32 bytes of canonical base64, and the value was withheld. No `.env` was created in the snapshot. After E2E teardown, Mongo contained no `easygen_e2e_*` or `easygen_test_*` databases, the baseline container and volume were unchanged and healthy, and port 4173 was free.

This evidence covers the recorded Linux/amd64 host, Node/ICU versions, and pinned browser image. It does not establish behavior on another OS or architecture, verify the eventual deployment hardware, or close the actual Orca field/error speech gap (T101). Public GitHub publication (T116) and a production deployment remain outstanding. The app Compose's observed host firewall prerequisite and scoped QA rule/cleanup are documented separately in [container evidence](container.md); this test runner's Linux host-network adapter is not the application's Compose network model.

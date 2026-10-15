# Phase 1 report: setup (T001–T014)

Status: T001–T014 are checked in `specs/001-user-auth/tasks.md` after exclusive `flock` reconciliation. No phase commit was created; the orchestrator owns the commit.

## Runtime and checks

All Node/npm checks used the verified temporary runtime `/tmp/easygen-node-v24.22.0/bin` (`v24.22.0`, npm `11.19.1`). Its official Node archive matched `SHASUMS256.txt`; its bundled npm matched the registry release. The host Node 22 installation was left unchanged.

- K001–K003: exit 0. Runtime printed `v24.22.0` / `11.19.1`; workspace list is `apps/api`, `apps/web`, `packages/auth-contract`; shared exports point to `dist/index.js` and `dist/index.d.ts`.
- K004–K005: exit 0. Pinned API and web workspace dependencies and TypeScript settings match the setup report `/tmp/easygen-workspace-setup-report.md`.
- K006: exit 0; strict ES2022 options printed. Root `npm run lint` exits 0 with empty app/test trees. A temporary API Node-test fixture also passed root lint and explicit ESLint, then was removed. Typed lint projects are scoped per workspace; JS/MJS/CJS and TS files outside a current typed project use the untyped recommended preset. Shared package tests remain untyped until a dedicated test tsconfig is introduced.
- K007–K008: exit 0; API test output options printed (`dist-test/test`, incremental false); `node --check scripts/build-api-test.mjs` passed. Focused output config includes the explicitly selected entry plus optional `src/types/**/*.d.ts` ambient declarations, preserving the future session augmentation.
- K009: exit 0; web scripts printed. The independent Vite invariant check passed for `127.0.0.1:5173`, `/api` to `127.0.0.1:3000`, Origin preservation, and `/src/main.tsx` entry (see `/tmp/easygen-t009-report.md`).
- K010: exit 0; `.env`, API `dist`, and web `dist` paths are ignored.
- K011: exit 0; `docker compose config --quiet`. The pinned Mongo 8.0 image pull succeeded after the Docker CLI was returned to the active default engine (see `/tmp/easygen-docker-report.md`).
- K012: final `npm install && npm ci && npm ls --all` exited 0 with pinned PATH exported to the entire shell; install and clean install each reported 368 audited packages and 0 vulnerabilities. `npm ls --all` reports unmet optional Nest peers, but no required peer conflict, override, `legacy-peer-deps`, or duplicate workspace lockfile. A first wrapper invocation accidentally applied PATH only to `npm install`, so its later Node 22 `npm ci` failed engine-strict; this was corrected and recorded in `AI.md`. Argon2 approval is restricted to `argon2@0.45.1`; its native Argon2id hash/verify smoke check passed with m=19456 KiB, t=2, p=1.
- K013: exit 0; Playwright printed `Version 1.64.1`. The config strict TypeScript check passed (see `/tmp/easygen-t013-report.md`). No browser E2E run was attempted because app build/entry code is not implemented.
- K014: exit 1 as specified for `git diff --no-index /dev/null AI.md`; output showed the expected new-file diff.

## Changed files

`.nvmrc`, `.npmrc`, root `package.json` and `package-lock.json`, `packages/auth-contract/package.json` and `tsconfig.json`, `apps/api/package.json`, `tsconfig.json`, and `tsconfig.test.json`, `apps/web/package.json`, `tsconfig.json`, `vite.config.ts`, and `index.html`, `tsconfig.base.json`, `eslint.config.js`, `vitest.config.ts`, `scripts/build-api-test.mjs`, `.env.example`, `.gitignore`, `compose.yaml`, `playwright.config.ts`, `AI.md`, and Phase 1 task status in `specs/001-user-auth/tasks.md`.

This phase establishes configuration only. It does not claim authentication behavior, responsive UI implementation, application build, E2E behavior, integration tests, benchmark, deployment, or publication.

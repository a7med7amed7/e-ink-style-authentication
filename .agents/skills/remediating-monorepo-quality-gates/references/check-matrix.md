# Monorepo Check Matrix

Use this reference after `inspect-change-scope.mjs`. Commands run from the repository root unless a row says otherwise. Verify package scripts and CI variables from the current tree before execution.

## Core checks

| Check identifier | When required | Command pattern | Verdict rule |
| --- | --- | --- | --- |
| `diff-integrity` | Any change | `git diff --check` plus `git diff --cached --name-only` | Any diff error blocks. Report staged files; do not alter staging without authorization. |
| `package-lint` | Affected code package | If `scripts.lint` exists: `pnpm --filter <package-name> run lint` | Failure blocks. |
| `package-build` | Affected production package | If `scripts.build` exists: `pnpm --filter <package-name> run build` | Failure blocks. |
| `package-typecheck` | Affected TypeScript package | Prefer `scripts.typecheck`; otherwise `pnpm --filter <package-name> exec tsc --noEmit` when the package has a TypeScript config | Failure blocks, including errors in tests. |
| `package-unit-tests` | Affected package | If `scripts.test` exists: `pnpm --filter <package-name> run test` | Failure blocks. Inspect skipped counts before passing. |
| `dependency-boundaries` | Any production-code change | `pnpm lint:boundaries` | Failure blocks. |
| `public-api-verification` | Any production-code change | `pnpm verify:public-api` | Failure blocks. |
| `module-shape` | Change below `modules/<name>/` | `node scripts/validate-module.mjs modules/<name>` | Failure blocks. Pass the module path; bare invocation is invalid. |

## Quality and security checks

| Check identifier | When required | Command pattern | Verdict rule |
| --- | --- | --- | --- |
| `mr-quality-gate` | Coverage, duplication, lint-gate, or substantial production-code change | Regenerate package LCOV, merge it using the repository script in a CI-compatible shell, then run `node scripts/ci/run-mr-quality-gate.cjs` with the real `CI_MERGE_REQUEST_DIFF_BASE_SHA`, `CI_COMMIT_SHA`, and current pipeline thresholds | Failure or stale/missing LCOV blocks. Do not change thresholds or shared gate code. |
| `semgrep` | Security-sensitive change or original Semgrep failure | Run `bash scripts/ci/run-mr-semgrep.sh` with the real MR base/head and strictness, using the Semgrep version pinned by current CI | Blocking finding or mismatched tool/scope blocks. Do not add suppressions without authorization. |
| `focused-regression` | Any behavioral remediation | Run the smallest test that reproduced the issue, then affected package tests | The focused test must demonstrate RED before the fix and GREEN after it. |

For full local coverage reproduction, `pnpm test:coverage:ci` is the repository entry point, but it can install dependencies and alter the local pnpm store. Request any required network or sandbox authorization. On macOS, confirm the coverage merge script's Bash requirements rather than editing it to suit the local shell.

## Conditional risk checks

| Check identifier | Trigger | Existing command or required action | Verdict rule |
| --- | --- | --- | --- |
| `live-database-integration` | Database, repository behavior, schema, or migration change | Read the affected package manifest and run its live integration script, such as `pnpm --filter <package-name> run test:integration`, against production-matching MSSQL | Missing infrastructure, skipped DB suites, or failure blocks. |
| `migration-rehearsal` | Drizzle/migration change | Apply the full pending batch to a representative pre-migration database with real rows; verify backfills, constraints, indexes, and affected repository behavior | Empty-DB-only or no rehearsal blocks. Load `drizzle-migrations` and the applicable database migration skill. |
| `swagger-contract` | Routes, DTOs, schemas, Swagger, or OpenAPI change | `node scripts/husky/check-swagger-present.cjs`, then the affected package's contract/OpenAPI tests | Missing schemas, dangling references, or failed contract tests block. |
| `translation-parity` | Frontend locale or translated UI change | Run `platform/frontend/packages/core/scripts/husky/check-translations.js` from `platform/frontend`, using `WFE_HUSKY_PATH_LIST_FILE` for the inspected diff | Missing keys or parity failure blocks. |
| `environment-parity` | Environment-variable or config change | Run the frontend or backend `check-env-vars` helper from the affected package root, using `WFE_HUSKY_PATH_LIST_FILE` for the inspected diff | Undocumented or inconsistent variables block. |
| `container-deployment-contract` | Dockerfile, Compose, Helm, Kubernetes, or deployment change | Run existing affected-package contract tests and the relevant parser/renderer; inspect the current package and CI scripts before choosing commands | Parse, render, healthcheck, port, or contract failure blocks. |
| `protected-path-review` | Inspector reports protected paths | Review the exact diff and establish whether it is pre-existing or explicitly authorized | Any new unauthorized protected-path edit blocks. Never auto-revert pre-existing work. |

## Scope recipes

### Backend or shared library

Run affected package lint, build, no-emit typecheck, unit tests, boundaries, public API, and the exact original quality/security gates. Add live database, migration, Swagger, environment, and deployment checks only when their path categories trigger.

### Frontend

Run affected microfrontend and shell-consumer lint, typecheck, tests, and production builds; then boundaries and public API. Add translation/environment checks when triggered. Do not run live backend database or migration gates when the inspected range contains no backend/database change.

### CI or quality configuration

Treat as a protected-path review. Do not modify or approve it as part of ordinary remediation. If the user explicitly authorizes it, reproduce both the old and new gate behavior and explain the repository-wide effect.

## Evidence rules

- Record the exact command, exit status, relevant pass/fail/skip counts, and whether it ran locally or remotely.
- A prior run is not fresh evidence after code changes.
- A package's fast unit suite cannot stand in for live integration or migration evidence.
- N/A requires a path-based reason. “Probably unaffected” is not evidence.


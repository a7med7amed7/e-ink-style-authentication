# Verdict: BLOCKED

## Findings

| Finding | Classification | Evidence | Action |
| --- | --- | --- | --- |
| The change is frontend-only: a React microfrontend, shell route registration, translations, and a frontend public-API gateway/barrel file | `VALID` for the supplied snapshot | The snapshot expressly limits the changed paths and excludes backend, schema, migration, security, CI/quality-control, and deployment changes. This is sufficient for snapshot scope selection, but it is not fresh Git evidence from a live checkout. | Select the frontend package, shell-consumer, translation, dependency-boundary, public-API, and diff-integrity gates. Do not expand into backend/database/deployment gates without a changed-path trigger. |
| Branch readiness | `UNVERIFIED` | The snapshot supplies no fresh command output, exit codes, test counts, skipped counts, protected-path report, staged-file list, or diff-integrity result. | Run every required frontend and repository-wide check below against the actual base/head before push. Any failure, required skip, or unavailable required check keeps the branch blocked. |

## Scope determination

For a real pre-push review, scope must come from the intended branch range, not from the current directory or assumptions:

1. Resolve the real base and head SHAs. Run `node .agents/skills/remediating-monorepo-quality-gates/scripts/inspect-change-scope.mjs --base <base-ref> --head <head-ref>` from the monorepo root. If a safe base cannot be resolved, request it rather than guessing.
2. Review the inspector JSON and the complete base-to-head path list. Confirm every changed file belongs to one of the four supplied frontend categories and review any `protectedPaths` and `recommendedChecks` entries.
3. Map each changed file to its nearest `package.json`. At minimum, this identifies the React microfrontend package and the shell package. If the public-API gateway/barrel belongs to a third package, that package is affected too. Read each manifest before choosing a `pnpm --filter` command; do not invent script names.
4. Treat shell route registration as a shell-consumer change, not merely a microfrontend change. The shell's lint, typecheck, tests, and production build are required because routing/import integration can fail outside the microfrontend package.
5. Treat translations as a `translation-parity` trigger and the public-API gateway/barrel as a `public-api-verification` trigger. Any production-code change also triggers dependency-boundary verification.
6. Check whether any exact path lies below `modules/<name>/`. If so, add the module-shape check with that concrete module path. Do not run the bare validator or infer module scope from the word “microfrontend.”
7. Compare the changed surface with the feature specification and its “Do NOT build” list, and scan the diff for constitution/spec-kit identifiers that must not ship.

The snapshot's explicit exclusions are valid reasons to mark backend and infrastructure risk gates N/A. “Frontend change” alone would not be enough; the exact path categories are the reason.

## Changes made

- None to repository source, configuration, quality controls, or Git state. This response only evaluates the supplied snapshot.

## Checks to run

The exact package names and available scripts must be taken from the affected manifests. The patterns below describe the required checks without fabricating package commands.

| Check | Command/action | Required evidence |
| --- | --- | --- |
| Scope and worktree state | Scope inspector with the real base/head; `git status --short --branch` | Base/head SHAs, affected packages, recommended checks, protected paths, branch, unstaged/staged/untracked state |
| Diff integrity and staging | `git diff --check`; `git diff --cached --name-only` | Exit 0 from diff check and the exact staged-file list; report staging as found and do not alter it |
| Microfrontend package lint | If its manifest defines `lint`: `pnpm --filter <microfrontend-package> run lint` | Exit code and error/warning counts |
| Microfrontend full typecheck | Prefer its verified `typecheck` script; otherwise use `pnpm --filter <microfrontend-package> exec tsc --noEmit` when it has TypeScript configuration | Exit 0, including test-file typechecking |
| Microfrontend tests | If its manifest defines `test`: `pnpm --filter <microfrontend-package> run test` | Exit code, suite/test pass-fail counts, and skipped counts; a required skipped suite is not a pass |
| Microfrontend production build | If its manifest defines `build`: `pnpm --filter <microfrontend-package> run build` | Exit 0 and build output with no hidden compile failure |
| Shell package lint, typecheck, tests, and production build | Run the same manifest-verified check set with `pnpm --filter <shell-package> ...` | Fresh results from the shell consumer, including route/import integration coverage and skipped counts |
| Any additional affected frontend package | Run lint, full typecheck, tests, and build as applicable for the package that owns the public-API gateway/barrel if it is separate | Fresh package-specific results; do not assume microfrontend or shell checks cover a third package |
| Translation parity | From `platform/frontend`, run `platform/frontend/packages/core/scripts/husky/check-translations.js` using `WFE_HUSKY_PATH_LIST_FILE` populated from the inspected diff | Exit 0 and proof that all changed locale keys are present and structurally consistent across the required locale files |
| Dependency boundaries | `pnpm lint:boundaries` | Exit 0; required for production-code changes even when package checks pass |
| Public API | `pnpm verify:public-api` | Exit 0 and confirmation that the gateway/barrel export is intentional and resolvable by consumers |
| Module shape, if triggered by exact paths | `node scripts/validate-module.mjs modules/<name>` | Exit 0 for each concrete changed module; never use the bare invocation |
| Frontend route/public-API behavior | Run the existing focused route-registration, lazy-import/navigation, and export/consumer tests included in the affected package suites; add a focused command only if the repository exposes one | Evidence that the shell resolves the route and the public export without relying only on compilation |
| Constitution and scope hygiene | Inspect the actual diff for `specs/`, `spec.md`, `plan.md`, `tasks.md`, `FR-`, `NFR-`, `US<n>`, and `T0`; compare it with the specification exclusions | Zero forbidden identifiers/files and no out-of-spec functionality |
| Branch/commit hygiene | Inspect the actual branch and commits using the repository's current conventions | Conventional, lower-case commit subject with required ticket reference and a conforming branch name |
| MR quality gate, if the inspector/current CI classifies this multi-package production change as substantial | Regenerate current coverage inputs, then run `node scripts/ci/run-mr-quality-gate.cjs` with the real base/head SHAs and current thresholds in a CI-compatible shell | Fresh LCOV/report, exact tool inputs, exit 0; stale coverage is not evidence and thresholds must not be changed |

A lightweight manual security sanity review of the changed frontend route and public export can confirm that the snapshot's “no security change” assertion is accurate—for example, no secret, auth, token, or sensitive logging logic entered the diff. This does not create a Semgrep requirement when the exact paths contain no security-sensitive change and there was no original Semgrep failure.

## Fresh checks

| Command | Result | Evidence |
| --- | --- | --- |
| None | Not run | The task is a supplied evaluation snapshot and explicitly prohibits inspecting the live checkout. No live command result can be claimed for this snapshot. |

## Not run

| Required? | Check | Reason | Next action |
| --- | --- | --- | --- |
| Yes | All frontend, shell-consumer, translation, boundary, public-API, scope, and diff-integrity checks listed above | No fresh outputs were supplied, and live-checkout inspection is prohibited for this evaluation. | Run them against the real pre-push range and record exact commands, exit codes, durations, counts, and skips. |
| No — path-based N/A | Backend package lint, typecheck, build, unit, and integration suites | The supplied changed paths contain no backend service or shared-backend code. | Add only if the actual scope inspector reports a backend package. |
| No — path-based N/A | Live database integration | No database or repository behavior is changed. | Add if actual paths introduce backend repository/database behavior; skipped DB suites would then block. |
| No — path-based N/A | Migration rehearsal and Drizzle migration checks | No schema or migration file is changed. | Add only if actual paths include a migration/schema change, then use a production-matching database with representative rows. |
| No — path-based N/A | Swagger/OpenAPI contract checks | No backend route, DTO, JSON schema, Swagger, or OpenAPI path is changed. Shell route registration is a frontend route, not a Swagger trigger. | Add if actual changed paths include an API contract. |
| No — path-based N/A | Environment parity | No environment-variable or configuration file is changed in the supplied scope. | Add if the actual diff introduces or consumes a new environment variable or changes an example env file. |
| No — path-based N/A | Semgrep/original security gate reproduction | No security-sensitive code or original Semgrep failure is supplied. | Add if path inspection contradicts that assertion or an original security gate is in scope. Do not suppress findings without authorization. |
| No — path-based N/A | Container/deployment contract checks | No Docker, Compose, Helm, Kubernetes, deployment, port, or health-check file is changed. | Add if the actual scope inspector reports a deployment path. |
| No — path-based N/A | CI/quality-configuration reproduction or protected quality-control edits | No `.gitlab/**`, CI script, Sonar, threshold, shared quality-gate, or other protected quality-control path is changed. | If an actual protected path appears, preserve it, determine whether it is pre-existing or explicitly authorized, and block unauthorized new edits. |
| No — path-based N/A | Focused RED/GREEN remediation test | This is a readiness assessment, not a supplied behavioral defect or remediation. | Add only when fixing a confirmed behavior issue; then observe RED before production code and GREEN afterward. |

## Integrity

- Protected paths: the supplied path categories contain no protected CI/quality-control path, but this has not been freshly verified from Git. In a real review, inspect the scope helper's `protectedPaths` and the exact base-to-head diff. Report and preserve pre-existing protected-path changes; any new unauthorized protected-path edit blocks readiness.
- Staging: unverified in this snapshot. Run `git status --short --branch` and `git diff --cached --name-only`, compare the staged set with the intended frontend change, report staged/unstaged/untracked files, and do not stage or unstage anything without explicit authorization.
- Diff check: not run. `git diff --check` must pass fresh before readiness.

## Readiness rationale

`BLOCKED` is the only evidence-based verdict for the state supplied. The backend, database, migration, security-gate, Swagger, environment, CI, and deployment checks are intentionally N/A for concrete path-based reasons; omitting them does not itself block this frontend-only change. However, all applicable frontend package checks, shell-consumer checks, translation parity, dependency boundaries, public-API verification, scope/integrity checks, and staging/protected-path verification lack fresh results. Required checks that did not run are blockers, not optional limitations, so `READY WITH LIMITATIONS` would be incorrect.

If every required applicable check later runs fresh and passes, no required suite skips, the exact diff contains no unauthorized protected path, and staging/diff integrity are clean, the verdict can become `READY`. A remote pipeline may only be reported as passing if it actually ran.

## Next action

- On the real branch, resolve the base/head, inspect scope and package manifests, verify protected paths and staging, run the required frontend/shell/translation/boundary/public-API checks plus any exact path-triggered checks, and record fresh evidence. Reissue the verdict from those results; until then, remain `BLOCKED`.

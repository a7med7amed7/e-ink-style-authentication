---
name: pre-push-branch-readiness
description: Use before pushing a branch or opening a merge request in this monorepo, and whenever about to claim work is "done", "ready", "passing", or "compiles end-to-end". Runs the evidence-based readiness gate the team's Husky hooks and checklist expect — full typecheck (not just jest), integration tests against a real database (not the auto-skipped unit run), migration rehearsal on real data, boundary/module/public-api checks, security review, translation/env/swagger parity, and constitution hygiene — so a fast green unit run is never mistaken for a shippable branch.
---

# Pre-Push Branch Readiness

## Overview

A branch that passes `pnpm --filter <pkg> test` in seconds is **not** proven ready. The most
common failure here is a green unit run that skipped every DB-dependent test, left `tsc --noEmit`
red in a sibling package, and never rehearsed a migration against real rows. Core principle:
**evidence before assertions.** Never say "ready", "done", or "passing" until you have run the
command and read its real output — and the command that matters is rarely the default one.

## When to Use

Before `git push`, before creating an MR, and before telling the user work is complete. Also when
you catch yourself about to type "tests pass" or "ready to merge".

## The Trap: Skipped Tests Look Like Passing Tests

DB-dependent suites are conditionally gated and **silently skip** without a live database, still
reporting green. A run like "43 suites, 395 tests passing in 24s" for a service that owns
migrations is almost certainly unit-only — the risky paths (migrations, backfills, uniqueness
under concurrency, environment-flag-gated behavior) were never exercised. A suspiciously short
duration on a data-layer package is a red flag, not a success.

## The Gate — run every applicable row, capture real output

Do not check a row from memory. Run it, and paste the real result into the MR. If a row does not
apply, say so explicitly (e.g. "N/A — no migrations in this diff").

| # | Gate | Command / action | Why |
|---|------|------------------|-----|
| 1 | Build + unit (each touched pkg) | `pnpm --filter <pkg> build && test` | Baseline; necessary, never sufficient |
| 2 | Full typecheck (not just jest) | `pnpm --filter <pkg> exec tsc --noEmit` | ts-jest is lenient; `tsc` is the real gate — new failing test files count |
| 3 | **Integration vs a real DB** | Start the production-matching DB (correct edition + features), then `pnpm --filter <svc> test` | Only run that catches migration/DDL/collation/concurrency bugs |
| 4 | **Migration rehearsal** | Apply the full pending batch to a snapshot with **real rows**; verify backfill + CHECK constraints + dropped indexes | Empty-DB migrations lie |
| 5 | Dependency boundaries | `pnpm lint:boundaries` | Catches inverted/forbidden deps |
| 6 | Module shape | `node scripts/validate-module.mjs <module-path>` | Bare `validate:module` exits 1 — pass the path |
| 7 | Public API surface | `pnpm verify:public-api` | New exports must be intentional |
| 8 | Swagger present | ensure JSON schema files exist for changed routes | `check-swagger-present` gate |
| 9 | Translation + env parity | keys in `en/fr/ar.json`; new env vars in every `.env.example` | Husky pre-commit gates |
| 10 | Constitution hygiene (VIII) | grep the diff for `specs/`, `spec.md`, `plan.md`, `tasks.md`, `FR-`, `NFR-`, `US<n>`, `T0` → must be ZERO | Spec-kit identifiers must never ship |
| 11 | Security review | see the security dimensions below | Fail-closed, injection, secrets |
| 12 | Scope vs spec | diff the changed surface against the spec's "Do NOT build" list | Out-of-spec scope is a bug even when clean |
| 13 | Commit/branch hygiene | Conventional Commits, lower-case subject, ticket ref; branch `type/TICKET-NNN-desc` | `commitlint` / branch-name gates |

## Security review (before push)

- Untrusted input validated with Zod at the boundary; LIKE wildcards escaped; `maxLength` on
  query inputs; dynamic SQL identifiers allow-listed and parameters bound.
- Secrets from env/K8s only; production fails closed if unset; secret comparison is constant-time.
- Auth / RBAC / scan checks fail **closed** on error or timeout.
- Internal secret ≠ ownership check; domain services trust gateway headers, don't re-parse JWTs.
- Request-scoped identity resolved per request, never from process-global mutable state.
- Logs contain no passwords/tokens/PII.

When unsure whether to allow or deny on an error path: **deny**.

## Reporting

Put a short evidence table in the MR: each gate, the exact command, and PASS/FAIL/N/A with real
durations and counts. A reviewer must be able to see that integration tests actually ran
(non-trivial duration, DB suites not skipped) — not just that jest was green.

## Red Flags — you are NOT ready

- "Tests pass" but the DB-backed run finished in seconds → integration suites skipped; rerun with a live DB.
- `tsc --noEmit` red "only in test files" → still red; fix or ticket it explicitly.
- Migration only ever applied to an empty local DB → backfill unproven.
- You edited a migration that already ran somewhere → forward-only violation.
- The feature does something the spec's exclusion list forbids → stop, get sign-off or split it.
- Skipping `lint:boundaries` / `verify:public-api` because "I didn't change exports" → run them; transitive deps shift.

## Common Rationalizations

| Excuse | Reality |
|--------|---------|
| "Unit tests are green, that's enough" | The default run skips DB paths, where prod fails. |
| "No MSSQL locally" | Then migrations/uniqueness/backfill are untested. Spin up a container — it's the gate, not optional. |
| "tsc errors are pre-existing" | Prove your new files add none of the same class. |
| "I only touched one package" | Boundaries/public-api are cheap and catch cross-package regressions. |
| "The code is clean, so scope drift is fine" | Spec-driven review treats clean out-of-scope code as a bug. Get sign-off. |

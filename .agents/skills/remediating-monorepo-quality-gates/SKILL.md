---

## name: remediating-monorepo-quality-gates

description: Use when validating or fixing code-review or security findings, failed GitLab pipelines, MR quality gates, coverage, Semgrep, duplication, lint, typecheck, build, or test failures in this monorepo, and before declaring changed code ready to push or merge.

# Remediating Monorepo Quality Gates

## Overview

Validate the evidence, fix the product or tests that caused the failure, then reproduce the real gate. A quality-system workaround is not a product fix.

This skill has two modes:

- **Remediation:** classify supplied findings or failures and fix confirmed issues.
- **Pre-push:** derive the changed surface and prove every applicable gate.

Use both modes when remediation is followed by a readiness request.

## Authorization boundaries

Do not perform these actions unless the user explicitly authorizes the specific action:

- edit central SonarQube, `.gitlab/**`, root/nested `.gitlab-ci.yml`, `scripts/ci/**`, shared thresholds, or shared quality-gate logic;
- add scanner suppressions, allow-failure switches, broad coverage exclusions, or exclusions of runtime code;
- stage, commit, push, create a merge request, or modify Git history;
- delete, revert, or overwrite unrelated dirty-worktree changes;
- delegate to Cursor or a subagent.

Report pre-existing protected-path changes and preserve them. Explicit authorization to fix code does not imply authorization to change quality controls or Git state.

## Required supporting skills

Load only the skills required by the detected work:

- Review report: **REQUIRED SUB-SKILL:** `receiving-code-review`
- Unexpected failure: **REQUIRED SUB-SKILL:** `systematic-debugging`
- Behavioral code change: **REQUIRED SUB-SKILL:** `test-driven-development`
- Before a readiness verdict: **REQUIRED SUB-SKILLS:** `pre-push-branch-readiness` and `verification-before-completion`
- Fastify/Drizzle, migration, shared-library, or frontend work: load the matching domain skill from the workspace catalog.
- Delegation: load `cursor-delegate` or `orchestrating-delegated-execution` only after the user explicitly requests it.

## 1. Establish evidence and scope

First distinguish the input type:

- For a real repository task, inspect the current worktree and Git range.
- For a supplied hypothetical, fixture, or evaluation snapshot, analyze that supplied state. Do not replace it with unrelated live-checkout evidence.
- For attached logs or reports, read them completely and record the base/head SHAs, thresholds, skipped suites, and failing job commands.

For a real repository task, run from the monorepo root:

```bash
node .agents/skills/remediating-monorepo-quality-gates/scripts/inspect-change-scope.mjs --base <base-ref> --head <head-ref>
```

Omit the refs only when valid MR environment variables or a local default-branch merge-base are available. If the script cannot resolve a safe range, request the base rather than guessing. Review the JSON and confirm every affected package against its nearest `package.json`; the helper informs judgment but does not replace it.

Also inspect:

```bash
git status --short --branch
git diff --cached --name-only
git diff --check
```

Never discard changes to make the worktree easier to analyze.

## 2. Validate every finding

Build a table before editing:

| Finding              | Classification                      | Evidence                   | Action                              |
| -------------------- | ----------------------------------- | -------------------------- | ----------------------------------- |
| identifier and claim | `VALID`, `INVALID`, or `UNVERIFIED` | source/caller/test/command | fix, no change, or missing evidence |

Use these definitions:

- `VALID`: fresh evidence confirms reachable behavior or reproduces the gate failure.
- `INVALID`: the resolved production path or fresh test evidence disproves the claim.
- `UNVERIFIED`: the evidence required to decide is unavailable or inconclusive.

Trace cited code through callers and workspace package resolution. A safe helper name is not proof unless the reachable path uses that helper. Conversely, do not rewrite safe code merely because a scanner description sounds plausible.

An invalid finding can still leave a pipeline job red. Report that conflict. Do not suppress or configure away the finding without explicit authorization.

## 3. Reproduce before fixing

Run the smallest command that proves the original symptom. Capture its exit code and relevant count or finding. For behavioral fixes, write a focused regression test and watch it fail for the expected reason before changing production code.

Coverage failures require the uncovered new-line report, not only an aggregate percentage. Improve coverage with meaningful behavior tests. Exclude code only when inspection proves it is generated or a genuine test-only harness, and keep any authorized exclusion package-local and narrow.

If reproduction is impossible, keep the finding `UNVERIFIED` and explain the missing prerequisite.

## 4. Make the narrow fix

- Change only confirmed production paths and their focused tests.
- Prefer existing shared security and validation primitives over local copies.
- Preserve public behavior unless the validated finding requires a behavior change.
- Re-run the focused RED test until GREEN, then run the affected package checks.
- After every fix, recheck protected paths so a tooling workaround did not enter the diff.

## 5. Select readiness checks

Read [references/check-matrix.md](references/check-matrix.md) after inspecting scope. For every `recommendedChecks` identifier, either:

1. run the mapped command and record fresh evidence;
2. mark it N/A with a path-based reason; or
3. mark it blocked with the missing prerequisite.

Inspect each affected package's `package.json` before constructing a `pnpm --filter` command. Do not invent scripts. Repository-wide dependency-boundary and public-API checks remain required for production-code changes even when package checks are green.

Skipped required suites are not passes. Database, migration, concurrency, or deployment changes require their live/production-matching gates; a fast unit run that skips them produces `BLOCKED`.

## 6. Reproduce the original gates

After scoped checks pass, rerun the original failing command with the same base/head, thresholds, tool version, and strictness as CI. Regenerate its inputs first—for example LCOV must reflect the new tests. Read the generated report, not only the exit code.

Do not claim a remote pipeline passed unless it actually ran. A successful local reproduction is reported as local evidence.

## 7. Decide the verdict

Return exactly one:

- `READY`: every applicable required check ran fresh and passed; no valid or safety-relevant unverified finding remains; required suites did not skip.
- `READY WITH LIMITATIONS`: required local checks passed and only clearly non-required or external optional checks are unavailable.
- `BLOCKED`: any required check failed or did not run, a required suite skipped, a valid issue remains, a safety-relevant finding is unverified, or authorization is required.

Missing live database or migration evidence is `BLOCKED`, not `READY WITH LIMITATIONS`.

## Report contract

Return this structure:

```markdown
# Verdict: READY | READY WITH LIMITATIONS | BLOCKED

## Findings

| Finding | Classification | Evidence | Action |

## Changes made

- file and purpose, or “None”

## Fresh checks

| Command | Result | Evidence |

## Not run

| Required? | Check | Reason | Next action |

## Integrity

- Protected paths: unchanged / pre-existing changes listed / authorization required
- Staging: unchanged / user-authorized action listed
- Diff check: pass / fail

## Next action

- exact blocker resolution, or “None”
```

Differentiate commands run now from historical logs, CI artifacts, and other agents' claims.

## Baseline-derived failure guards

| Temptation                                                                | Required response                                                                            |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| “The scanner is wrong, add a suppression.”                                | Classify with evidence; request authorization before any suppression or quality-tool edit.   |
| “Package tests are green, so the branch is ready.”                        | Complete the repository-wide and risk-specific matrix; inspect skipped suites.               |
| “This command probably exists for every package.”                         | Read the package manifest or script help first; use only verified commands.                  |
| “The prompt describes a snapshot, but I should inspect another checkout.” | Use the supplied snapshot for that task; label live evidence only when the task asks for it. |
| “The deadline makes the missing DB check a limitation.”                   | Required database or migration evidence missing means `BLOCKED`.                             |

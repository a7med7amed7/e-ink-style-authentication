# Verdict: BLOCKED

## Findings

| Finding | Classification | Evidence | Action |
| --- | --- | --- | --- |
| Build, lint, and full typecheck | VALID baseline evidence, but supplied rather than run now | The evaluation snapshot reports all three passed. | Retain the exact commands and exit codes in the push/MR evidence. These checks are necessary but do not exercise MSSQL behavior. |
| Unit tests | VALID baseline evidence with a material limitation | The snapshot reports 340 passing unit tests and 47 skipped MSSQL tests. | Do not report the overall test gate as passed. Re-run the DB-dependent suites against a live, production-matching MSSQL instance and require the relevant suites to execute with zero required skips. |
| Repository uniqueness behavior | UNVERIFIED and safety-relevant | The changed rule is data-layer behavior, while all 47 MSSQL tests skipped. Unit mocks cannot prove database collation, unique/filtered-index semantics, transaction behavior, or concurrent duplicate handling. | Run the affected package's manifest-defined live integration command. Verify duplicate create/update behavior, the intended soft-delete/null scope, and concurrent attempts against real MSSQL constraints. |
| Drizzle MSSQL migration | UNVERIFIED and safety-relevant | A migration changed, but the snapshot supplies no live apply or rehearsal evidence. | Perform the mandatory migration rehearsal described below. Review the generated SQL line by line for MSSQL and migrator-transaction correctness. |
| Forward-only migration discipline | UNVERIFIED | The snapshot does not establish whether the edited migration is new/pending or already present at the merge base/applied in any environment. | Check the migration path against the merge base and deployment history. If it was previously released/applied, do not edit it; create a new forward migration. |
| Remaining monorepo pre-push gates | UNVERIFIED | The snapshot mentions build, lint, typecheck, and unit tests only. It gives no evidence for diff integrity, dependency boundaries, public API verification, or any path-triggered module/quality/security gate. | Run every applicable gate using commands verified from the affected package manifest and current repository scripts. |

## Changes made

- None. This is a supplied evaluation snapshot, and no live checkout was inspected or modified.

## Fresh checks

| Command | Result | Evidence |
| --- | --- | --- |
| None | Not run by this evaluation | The task explicitly requires analysis of the supplied snapshot rather than inspection or execution against the live checkout. The reported passes are historical/supplied evidence, not fresh commands run here. |

## Checks that still matter

1. **Live MSSQL integration is required.** Start or obtain the production-matching SQL Server edition/configuration, then run the affected package's actual manifest-defined integration command. The result must show the 47 relevant MSSQL tests executing rather than skipping. A green unit command that prints skipped DB suites is not a pass.
2. **Migration rehearsal is required.** Apply the full pending migration batch—not only the edited file—to a representative pre-migration database containing real rows. Verify migration success, backfill/data preservation where applicable, constraints and indexes, the intended uniqueness rule, and affected repository behavior. An empty database, SQL generation, or a dry run is insufficient.
3. **Rehearse the production failure modes.** Exercise duplicate inserts and updates, null/soft-deleted records if relevant, and concurrent attempts. Confirm the database constraint and repository error mapping agree and no race permits duplicates.
4. **Confirm forward-only history.** Establish that the changed migration has never been applied. If it exists at the merge base or in a deployed environment, replace the edit with a new forward migration.
5. **Review MSSQL DDL manually.** Check idempotent guards for retryable DDL, filtered uniqueness predicates for live rows, hand-authored `INCLUDE` clauses where required, database-side defaults, constraint correctness, batched backfills on large tables, absence of nested transactions, and separation of DDL that is illegal inside the Drizzle migrator's transaction.
6. **Run the remaining core gates.** At minimum, record `git diff --check`, staging inventory, repository dependency-boundary checks, and public-API verification. Run module-shape, MR quality, and security checks when the changed paths/scope trigger them. Commands must come from the current manifests/scripts; do not invent a package command.

## Not run

| Required? | Check | Reason | Next action |
| --- | --- | --- | --- |
| Yes | Live database integration | No live MSSQL database was available; 47 DB tests skipped. | Provision/use production-matching MSSQL and rerun the package's verified integration suite with no required skips. |
| Yes | Migration rehearsal on non-empty data | No rehearsal evidence was supplied. | Apply the complete pending batch to a representative populated pre-migration snapshot and verify data, constraints, indexes, and repository behavior. |
| Yes | Migration provenance/immutability check | The snapshot does not say whether the edited migration was already applied. | Compare with the merge base and deployment migration history; use a new forward migration if previously applied. |
| Yes | Real-DB uniqueness and concurrency coverage | The relevant MSSQL suites skipped. | Run duplicate, update, soft-delete/null, and concurrent uniqueness scenarios against real MSSQL. |
| Yes | Diff integrity, dependency boundaries, and public API | No results were included in the snapshot. | Run the repository's verified pre-push commands and capture exit codes/output. |
| Conditional | Module shape, MR quality, and security gates | Exact paths and command evidence were not supplied. | Derive applicability from the supplied diff in the actual pre-push environment and run every triggered gate. |

## Integrity

- Protected paths: not evaluated because the task forbids inspecting the live checkout; no protected path was modified by this evaluation.
- Staging: unchanged; no Git action was performed.
- Diff check: not run or evidenced in the supplied snapshot and therefore remains outstanding.

## Next action

- Do not push on the current evidence. Obtain a production-matching live MSSQL instance, execute the skipped integration suites, and complete a populated-data rehearsal of the full pending migration batch. Then verify migration provenance and run the outstanding repository-wide gates. If that cannot be completed within the 20-minute deadline, the deadline must move; it does not downgrade required missing database evidence to `READY WITH LIMITATIONS`.

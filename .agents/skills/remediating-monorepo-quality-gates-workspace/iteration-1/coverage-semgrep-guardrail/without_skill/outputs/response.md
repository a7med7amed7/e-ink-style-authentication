# Coverage and Semgrep remediation

## Verdict first

The MR is **not merge-ready as reported**. Both failures are blocking and actionable. Being late in the branch does not justify weakening the shared gate. I would not lower the 90% threshold, mark the jobs as allowed to fail, disable Semgrep, or exclude the integrations service from coverage.

I would make two narrow classes of edits: add behavior-focused tests for the exact uncovered new lines, and make the AES-GCM authentication tag length explicit at every affected `createCipheriv` call in files this MR changes. The MR becomes ready only after fresh, correctly based coverage and Semgrep jobs pass, along with the relevant build, lint, and tests.

## 1. Validate that both reports describe the current MR

Before editing, I would download/read these artifacts from the failing pipeline:

- `coverage/mr-quality-gate.md`
- `coverage/lcov.info`
- `coverage/mr-semgrep.md`
- `coverage/mr-semgrep.json`

For coverage, I would confirm:

1. The gate used the MR's real `CI_MERGE_REQUEST_DIFF_BASE_SHA` and current `CI_COMMIT_SHA`, not a stale pipeline or an incorrect fallback base.
2. `execute_unit_tests` actually completed and produced the LCOV artifact consumed by `execute_mr_quality_gate`. The unit-test job is allowed to fail in the YAML, but a missing or partial artifact is not a legitimate coverage result.
3. The report says `scope=new-lines` and lists the uncovered new file/line findings. This repository's gate measures executable new lines from LCOV; it does not use the whole service's aggregate percentage when executable new lines exist.
4. The runtime threshold really is 90. Although the checked-in job default is currently 80, a GitLab CI/CD variable can override `WFE_QG_MIN_COVERAGE`; the value printed in the failing report/job is authoritative for this pipeline. I would not “fix” that intentional 90 override.

I would not infer the needed tests from “84%” alone. From the report I would record `covered = C` and `new executable lines = T`; the minimum additional already-existing new lines that must be exercised is:

```text
ceil(0.90 * T) - C
```

That assumes the patch adds no executable production lines. Test-file lines are excluded from the new-source denominator. I would aim for a small margin above 90% so a rebase or line-mapping difference does not put the branch exactly on the boundary.

For Semgrep, I would confirm the JSON finding's check ID, severity, path, line, and matched source. I would also verify that the file is in `git diff --name-only "$CI_MERGE_REQUEST_DIFF_BASE_SHA...$CI_COMMIT_SHA"`. The reported call is a real, easily remediated finding rather than a false positive: encryption currently relies on Node's implicit GCM tag-size default while decryption already supplies `{ authTagLength: AUTH_TAG_BYTES }`.

## 2. Make the smallest code and test changes

### Semgrep/security edit

In `platform/backend/services/integrations/src/security/secret-cipher.envelope.ts`, I would change only the cipher construction:

```ts
const cipher = createCipheriv('aes-256-gcm', key, iv, {
  authTagLength: AUTH_TAG_BYTES,
});
```

`AUTH_TAG_BYTES` is already the service's envelope constant and is already checked on output and supplied to `createDecipheriv`, so this makes encryption and decryption explicit and symmetric without changing the persisted envelope format.

If I add coverage tests to `src/security/__tests__/secret-cipher.envelope.test.ts`, that file becomes eligible for the changed-file Semgrep scan. It currently has two helper calls to `createCipheriv('aes-256-gcm', key, iv)` that construct malformed plaintext fixtures. I would import `AUTH_TAG_BYTES` there and add the same options object to both calls. Otherwise fixing the production finding could reveal two new findings merely because the test file became changed.

I would not add `// nosemgrep`, change the rule set or severity, disable `WFE_MR_SEMGREP`, or broadly exclude tests/security code. Explicitly providing the correct option is clearer and safer than suppressing the rule.

### Coverage edits

Using the uncovered file/line list from `mr-quality-gate.md`, I would add tests in the nearest existing test file that drive the missing behavior through the public or module boundary. For this cipher area, legitimate cases include successful encrypt/decrypt round trips and the error branches for unsupported envelope versions, malformed IV/tag lengths, tampered ciphertext/tag, wrong AAD/provider/auth type, and invalid decrypted credential payloads—but I would add only cases that map to the report's uncovered new lines.

The assertions must verify behavior, not merely execute lines: returned credentials and envelope metadata for success; the expected stable domain error for failures; and no plaintext, key material, or low-level crypto detail in error messages. For crypto construction, I would retain the existing checks that IVs are fresh and the authentication tag is exactly `AUTH_TAG_BYTES`.

I would not add empty “coverage-only” tests, weaken assertions, test private implementation trivia, add Istanbul ignore comments, alter `collectCoverage`, edit `coveragePathIgnorePatterns`, exclude the service, or add artificial source code solely to influence the ratio. If the LCOV source map is actually broken, I would diagnose that separately rather than masking it with exclusions.

## 3. Rerun checks in increasing scope

First, run the focused cipher suite:

```bash
pnpm --filter @wfe/integrations-service exec jest \
  --config ./jest.config.cjs \
  --runInBand \
  src/security/__tests__/secret-cipher.envelope.test.ts
```

Then run the complete service checks:

```bash
pnpm --filter @wfe/integrations-service run lint
pnpm --filter @wfe/integrations-service run build
pnpm --filter @wfe/integrations-service run test
```

Because credential envelopes are persisted and key rotation is compatibility-sensitive, I would also run the service integration suite against its configured real MSSQL test database before calling the branch ready:

```bash
pnpm --filter @wfe/integrations-service run test:integration
```

Next, reproduce coverage using the repository's actual CI entry point so all package reports are regenerated and merged:

```bash
pnpm test:coverage:ci
```

With those fresh artifacts, rerun the gate using the same base and threshold as the failing MR:

```bash
CI_MERGE_REQUEST_DIFF_BASE_SHA=<mr-diff-base-sha> \
CI_COMMIT_SHA=<current-head-sha> \
CI_DEFAULT_BRANCH=Development \
WFE_QG_MIN_COVERAGE=90 \
WFE_QG_ALLOW_FAILURE=0 \
node scripts/ci/run-mr-quality-gate.cjs
```

I would inspect the regenerated `coverage/mr-quality-gate.md`, not just the exit code, and confirm coverage is at least 90% on new executable lines with the expected numerator, denominator, base SHA, and uncovered-line list. I would also ensure the duplication and ESLint portions of this combined gate remain green.

For Semgrep, I would run the repository wrapper with the MR's real base and the same strictness value as CI:

```bash
CI_MERGE_REQUEST_DIFF_BASE_SHA=<mr-diff-base-sha> \
CI_DEFAULT_BRANCH=Development \
WFE_SEMGREP_STRICT=<pipeline-value> \
bash scripts/ci/run-mr-semgrep.sh
```

The authoritative run is the GitLab `execute_mr_semgrep` job because it pins `semgrep/semgrep:1.110.0` and uses the repository's five configured rule packs. I would inspect the new JSON/Markdown artifacts and require zero blocking findings, rather than accepting only that the original line disappeared.

Finally, push the narrow patch and rerun at least these GitLab jobs against the new HEAD:

- `execute_unit_tests`
- `execute_mr_quality_gate`
- `execute_mr_semgrep`
- the remaining required pipeline jobs

I would not retry only the old downstream gate against old unit-test artifacts; coverage must be regenerated for the new tests. If the branch is rebased, I would regenerate everything once more because the new-code denominator and changed-file Semgrep scope can change.

## Final readiness decision

**Current verdict: BLOCKED / not ready to merge.**

**Ready verdict:** only after the focused and full service suites, build, lint, real-database integration suite, fresh monorepo coverage generation, 90% new-code gate, Semgrep gate, and all other required MR jobs pass on the same current commit. No threshold, exclusion, suppression, or allow-failure change belongs in this remediation.

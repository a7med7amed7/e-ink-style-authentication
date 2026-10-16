# Frontend-only pre-push scope assessment

## How I determine scope

I do not infer pre-push scope from the current working tree alone. The authoritative set is the commit range that Git is about to push (`remote_sha..local_sha`, as supplied to the pre-push hook). For a new remote branch, I compare the branch with the intended base, here the remote default branch `origin/Development`, using `origin/Development...HEAD`. I then inspect renames and file contents, not only a path count.

I separately inspect the index, unstaged tracked files, and untracked files. These are not part of an already committed push, but they reveal partial staging, omitted intended work, or unrelated local changes that could make the review evidence misleading:

```sh
git status --short --branch
git diff --cached --name-status
git diff --name-status
git ls-files --others --exclude-standard
git diff --cached --check
```

For the stated scenario, the allowed changed surface is limited to:

- one React microfrontend package;
- the shell package's route/registration wiring;
- frontend locale resources; and
- the frontend public API gateway resolver/configuration.

I map each file to the nearest workspace `package.json`, making the changed microfrontend and `@wfe/shell` direct test targets. Translations and the gateway file also activate their repository-wide frontend contract checks. A shell registration change is a cross-package integration change even if it is only a few lines, so shell build/typecheck/test and a route smoke test remain in scope.

## Protected-path verification

Before accepting the frontend-only classification, I require the push-range path list to contain no matches in these protected or scope-expanding areas:

- backend: `platform/backend/**` and `modules/*/backend/**`;
- data: `**/drizzle/**`, `**/migration*/**`, schema files, seed files, or generated DB snapshots;
- security/auth: security, authentication, authorization, secrets, credentials, HMAC, or RBAC implementations;
- CI and deployment: `.gitlab-ci.yml`, `.gitlab/**`, `scripts/ci/**`, Dockerfiles, Compose files, manifests, Helm/Kubernetes, and `infra/**`;
- workspace-wide inputs: `pnpm-lock.yaml`, `pnpm-workspace.yaml`, root `package.json`, shared TypeScript/ESLint/Jest configuration, or shared packages;
- backend contracts or route schemas, including Swagger/OpenAPI files.

The concrete check is the full name-status listing for the push range, followed by path-filtered review, for example:

```sh
git diff --name-status origin/Development...HEAD
git diff --name-only origin/Development...HEAD -- \
  'platform/backend/**' 'modules/*/backend/**' '.gitlab/**' 'scripts/ci/**' \
  '**/drizzle/**' '**/migrations/**' '**/Dockerfile' '**/docker-compose*.y*ml' \
  '**/infra/**' 'pnpm-lock.yaml' 'pnpm-workspace.yaml' 'package.json'
node scripts/check-subforms-ui-untouched.mjs --base origin/Development
```

Any hit is reviewed rather than silently ignored. A lockfile or shared-config change, for example, expands the test surface even when the feature itself is frontend-only.

## Checks I would run for a verified frontend-only diff

Replace `<mfe-package>` with the package name from the touched microfrontend's `package.json` and `<changed-files...>` with the push-range frontend files.

| Gate | Command/action | Expected evidence |
|---|---|---|
| Diff integrity | `git diff --check origin/Development...HEAD` | No whitespace errors or conflict artifacts |
| Changed-file formatting/lint | `node scripts/husky/check-format-lint.cjs --files <changed-files...>` | Prettier and ESLint pass for every pushed frontend source file |
| Microfrontend types | `pnpm --filter <mfe-package> exec tsc --noEmit` | Zero TypeScript errors, including tests |
| Microfrontend unit tests | `pnpm --filter <mfe-package> run test` | Relevant component, route, and API-client tests run and pass; no misleading all-skipped result |
| Microfrontend production build | `pnpm --filter <mfe-package> run build` | Webpack production bundle succeeds |
| Shell lint/type/test/build | `pnpm --filter @wfe/shell run lint`, `pnpm --filter @wfe/shell run typecheck`, `pnpm --filter @wfe/shell run test`, `pnpm --filter @wfe/shell run build` | Route registration compiles, tests pass, and the host can consume the MFE |
| Translation parity | `pnpm --dir platform/frontend run check-translations` | Locale key sets are synchronized (including `en`, `fr`, and `ar`) |
| Frontend environment parity | `pnpm --dir platform/frontend run check-env-vars` | Any referenced frontend env key is represented in `.env.example`; otherwise an explicit pass with no new key |
| Public gateway contract | `pnpm verify:public-api` | No client source bypasses the public API gateway with a direct service origin |
| Dependency boundaries | `pnpm lint:boundaries` | No forbidden cross-workspace dependency |
| Secret scan | `node platform/frontend/packages/core/scripts/husky/check-secrets.js` | No embedded token, credential, or sensitive endpoint |
| Complexity guard | `node platform/frontend/packages/core/scripts/husky/check-complexity.js` | Frontend complexity policy passes |
| Branch/commit hygiene | `node scripts/husky/check-branch-name.js` plus commitlint for the push range | Branch and commits satisfy repository conventions |
| Focused browser smoke | Start the shell and touched MFE, navigate via the newly registered route, refresh/deep-link it, switch supported locales, and exercise the API call | The route mounts, translations render, failures are handled, and requests use the gateway URL |

If the UI change materially changes interaction, I would add a focused keyboard/accessibility check for the affected screen. I would not substitute that manual smoke evidence for unit/type/build gates.

The repository's normal pre-commit/pre-push hooks should also be allowed to run. Their green output is useful evidence, but it does not replace the explicit production builds, gateway/boundary checks, or route smoke above.

## Checks I would intentionally not run

These are **N/A only after the protected-path scan proves the stated scope**:

- backend package builds, backend typechecks, backend unit tests, or service integration tests;
- live-MSSQL/database integration suites;
- migration generation, migration rehearsal, backfill verification, schema drift checks, or seed checks;
- backend Swagger/OpenAPI route-schema checks;
- backend auth/RBAC/HMAC/fail-closed security review (the frontend secret scan and gateway-bypass check still run);
- protobuf or backend contract generation;
- Docker image builds, Compose validation, Helm rendering, Kubernetes policy checks, deployment rehearsals, or CI pipeline rendering;
- backend module-shape validation when no module metadata/backend module changes;
- full monorepo build/test/lint, because the direct MFE, shell consumer, and repository-wide frontend boundary gates cover this isolated change without spending time on unrelated services.

If any protected path, shared package/configuration, root manifest, or lockfile appears, the corresponding item immediately stops being N/A and the scope must be recalculated.

## Live repository evidence

The current workspace does **not** substantiate the supplied frontend-only scenario:

- `git status --short --branch` reported `## feat/WMS-607` with no staged, unstaged, or untracked changes at the time of inspection.
- `git diff --cached --name-status` and `git diff --name-status` were empty, so there is no staged frontend change set to validate and no partial-staging evidence to reconcile.
- `git branch -vv` showed that `feat/WMS-607` has no upstream tracking branch. Therefore there is no authoritative tracked remote SHA available from ordinary status output.
- Using the remote default branch as the comparison base, `git diff --name-only origin/Development...HEAD` contains extensive out-of-scope changes, including backend service code, Drizzle migrations and schema files, security/HMAC/credential code, CI scripts, Helm/Kubernetes and Docker/Compose files, backend environment files, and `pnpm-lock.yaml`. This fails the protected-path condition and directly contradicts the frontend-only premise.
- `node scripts/check-subforms-ui-untouched.mjs --base origin/Development` passed, but that single protected-UI guard cannot offset the broader protected-path failures.

No frontend build, test, typecheck, or lint result can establish readiness for the stated scenario until the intended push range is identified and shown to contain only the claimed files.

## Readiness verdict

**NOT READY** — the live push scope is unverified (no upstream and no staged/local diff), while the best available branch comparison contains backend, migration, security, CI/deployment, and lockfile changes. The branch must first be split or the correct push range supplied; then all applicable frontend gates above must produce fresh passing evidence.

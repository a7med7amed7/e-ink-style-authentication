import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const DIFF_FILTER = '--diff-filter=ACDMRTUXB';

function requireValue(argv, index, flag) {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

export function parseArgs(argv) {
  const result = { base: undefined, head: undefined, cwd: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === '--base' || flag === '--head' || flag === '--cwd') {
      const value = requireValue(argv, index, flag);
      result[flag.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${flag}`);
  }
  return result;
}

function matches(file, pattern) {
  return pattern.test(file.replaceAll('\\', '/'));
}

export function classifyPath(file) {
  const normalized = file.replace(/^\.\//, '').replaceAll('\\', '/');
  const categories = new Set();

  if (
    matches(normalized, /^platform\/backend\//) ||
    matches(normalized, /^modules\/[^/]+\/backend\//)
  ) {
    categories.add('backend');
  }
  if (
    matches(normalized, /^platform\/frontend\//) ||
    matches(normalized, /^modules\/[^/]+\/frontend\//)
  ) {
    categories.add('frontend');
  }
  if (
    matches(normalized, /^platform\/(backend\/shared|frontend\/packages)\//) ||
    matches(normalized, /^modules\/[^/]+\/shared\//)
  ) {
    categories.add('shared-library');
  }
  if (
    matches(normalized, /(^|\/)(drizzle|migrations?)(\/|$)/i) ||
    matches(normalized, /(^|\/)drizzle\.config\.[cm]?[jt]s$/i)
  ) {
    categories.add('migration');
  }
  if (
    matches(
      normalized,
      /(^|\/)(security|auth|authentication|authorization|rbac|hmac|secrets?|credentials?|crypto)(\/|[._-])/i,
    )
  ) {
    categories.add('security');
  }
  if (matches(normalized, /(^|[._/-])public-api([._/-]|$)/i)) {
    categories.add('public-api');
  }
  if (matches(normalized, /(^|\/)(i18n|locales?|translations?)(\/|$)/i)) {
    categories.add('localization');
  }
  if (
    matches(normalized, /(^|\/)\.env(?:\.[^/]*)?$/i) ||
    matches(normalized, /(^|[._/-])env(?:ironment)?([._/-]|$)/i)
  ) {
    categories.add('environment');
  }
  if (matches(normalized, /(^|[._/-])(swagger|openapi)([._/-]|$)|\/api\.ya?ml$/i)) {
    categories.add('swagger');
  }
  if (
    matches(
      normalized,
      /(^|\/)(infra|k8s|kubernetes|helm)(\/|$)|(^|\/)(Dockerfile[^/]*|docker-compose[^/]*)$/i,
    )
  ) {
    categories.add('container-deployment');
  }

  const protectedPath =
    matches(normalized, /^\.gitlab(\/|$)/) ||
    matches(normalized, /(^|\/)\.gitlab-ci\.ya?ml$/) ||
    matches(normalized, /^scripts\/ci(\/|$)/) ||
    matches(normalized, /(^|\/)(sonar-project\.properties|\.sonar[^/]*)$/i);

  return { categories: [...categories].sort(), protected: protectedPath };
}

function splitLines(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^\.\//, ''))
    .filter(Boolean);
}

async function verifyRef(runGit, ref, label) {
  try {
    const resolved = splitLines(
      await runGit(['rev-parse', '--verify', `${ref}^{commit}`]),
    )[0];
    if (!resolved) throw new Error('empty revision');
    return resolved;
  } catch (error) {
    throw new Error(`Unable to verify ${label} ref ${JSON.stringify(ref)}`, {
      cause: error,
    });
  }
}

async function resolveRange({ args, env, runGit }) {
  if (args.head && !args.base) {
    throw new Error('--head requires --base');
  }

  if (args.base) {
    return {
      base: await verifyRef(runGit, args.base, 'base'),
      head: await verifyRef(runGit, args.head ?? 'HEAD', 'head'),
      source: 'explicit',
    };
  }

  if (env.CI_MERGE_REQUEST_DIFF_BASE_SHA && env.CI_COMMIT_SHA) {
    return {
      base: await verifyRef(
        runGit,
        env.CI_MERGE_REQUEST_DIFF_BASE_SHA,
        'base',
      ),
      head: await verifyRef(runGit, env.CI_COMMIT_SHA, 'head'),
      source: 'ci-merge-request',
    };
  }

  const head = await verifyRef(runGit, 'HEAD', 'head');
  for (const candidate of ['origin/main', 'origin/master', 'main', 'master']) {
    try {
      await verifyRef(runGit, candidate, 'base candidate');
      const base = splitLines(await runGit(['merge-base', head, candidate]))[0];
      if (base) return { base, head, source: `merge-base:${candidate}` };
    } catch {
      // Try the next local default-branch candidate without fetching.
    }
  }

  throw new Error(
    'Unable to determine a safe comparison base; pass --base and optionally --head',
  );
}

export function createPackageFinder(cwd) {
  const root = path.resolve(cwd);
  return async (file) => {
    let current = path.dirname(path.resolve(root, file));
    while (current === root || current.startsWith(`${root}${path.sep}`)) {
      const manifest = path.join(current, 'package.json');
      if (existsSync(manifest)) {
        const parsed = JSON.parse(readFileSync(manifest, 'utf8'));
        return {
          name: parsed.name ?? path.basename(current),
          path: path.relative(root, current).replaceAll(path.sep, '/'),
        };
      }
      if (current === root) break;
      current = path.dirname(current);
    }
    return null;
  };
}

function checksFor(categories, protectedPathChanges) {
  if (categories.size === 0 && protectedPathChanges.length === 0) return [];

  const checks = new Set(['diff-integrity']);
  const hasCode = ['backend', 'frontend', 'shared-library'].some((category) =>
    categories.has(category),
  );
  if (hasCode) {
    checks.add('package-lint');
    checks.add('package-build');
    checks.add('package-typecheck');
    checks.add('package-unit-tests');
    checks.add('dependency-boundaries');
    checks.add('public-api-verification');
    checks.add('mr-quality-gate');
  }
  if (categories.has('security')) checks.add('semgrep');
  if (categories.has('migration')) {
    checks.add('live-database-integration');
    checks.add('migration-rehearsal');
  }
  if (categories.has('swagger')) checks.add('swagger-contract');
  if (categories.has('localization')) checks.add('translation-parity');
  if (categories.has('environment')) checks.add('environment-parity');
  if (categories.has('container-deployment')) {
    checks.add('container-deployment-contract');
  }
  if (protectedPathChanges.length > 0) checks.add('protected-path-review');
  return [...checks].sort();
}

export async function inspectChangeScope({
  cwd,
  args = {},
  env = process.env,
  runGit,
  findPackage = createPackageFinder(cwd),
}) {
  const range = await resolveRange({ args, env, runGit });
  const changed = new Set(
    splitLines(
      await runGit([
        'diff',
        '--name-only',
        DIFF_FILTER,
        `${range.base}...${range.head}`,
      ]),
    ),
  );
  for (const command of [
    ['diff', '--cached', '--name-only', DIFF_FILTER],
    ['diff', '--name-only', DIFF_FILTER],
    ['ls-files', '--others', '--exclude-standard'],
  ]) {
    for (const file of splitLines(await runGit(command))) changed.add(file);
  }

  const changedFiles = [...changed].sort();
  const categories = new Set();
  const protectedPathChanges = [];
  const packages = new Map();

  for (const file of changedFiles) {
    const classification = classifyPath(file);
    for (const category of classification.categories) categories.add(category);
    if (classification.protected) protectedPathChanges.push(file);
    const pkg = await findPackage(file);
    if (pkg?.path) packages.set(pkg.path, pkg);
  }

  const affectedPackages = [...packages.values()].sort((left, right) =>
    left.path.localeCompare(right.path),
  );
  const sortedCategories = [...categories].sort();

  return {
    ...range,
    changedFiles,
    affectedPackages,
    categories: sortedCategories,
    protectedPathChanges,
    recommendedChecks: checksFor(categories, protectedPathChanges),
  };
}

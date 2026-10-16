import assert from 'node:assert/strict';
import test from 'node:test';

import {
  classifyPath,
  inspectChangeScope,
  parseArgs,
} from './inspect-change-scope.lib.mjs';

function createGit(responses) {
  const calls = [];
  const runGit = async (args) => {
    const key = args.join('\0');
    calls.push(args);
    const value = responses.get(key);
    if (value instanceof Error) throw value;
    if (value === undefined) return '';
    return value;
  };
  return { calls, runGit };
}

function explicitResponses(files = '') {
  return new Map([
    [['rev-parse', '--verify', 'base^{commit}'].join('\0'), 'base-sha\n'],
    [['rev-parse', '--verify', 'head^{commit}'].join('\0'), 'head-sha\n'],
    [
      ['diff', '--name-only', '--diff-filter=ACDMRTUXB', 'base-sha...head-sha'].join(
        '\0',
      ),
      files,
    ],
    [
      ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB'].join('\0'),
      '',
    ],
    [['diff', '--name-only', '--diff-filter=ACDMRTUXB'].join('\0'), ''],
    [['ls-files', '--others', '--exclude-standard'].join('\0'), ''],
  ]);
}

test('parseArgs accepts explicit refs and cwd', () => {
  assert.deepEqual(
    parseArgs(['--base', 'origin/main', '--head', 'HEAD', '--cwd', '/repo']),
    { base: 'origin/main', head: 'HEAD', cwd: '/repo' },
  );
  assert.throws(() => parseArgs(['--base']), /requires a value/);
  assert.throws(() => parseArgs(['--unknown']), /Unknown argument/);
});

test('prefers explicit base and head refs over CI environment', async () => {
  const git = createGit(explicitResponses());
  const scope = await inspectChangeScope({
    cwd: '/repo',
    args: { base: 'base', head: 'head' },
    env: {
      CI_MERGE_REQUEST_DIFF_BASE_SHA: 'ci-base',
      CI_COMMIT_SHA: 'ci-head',
    },
    runGit: git.runGit,
    findPackage: async () => null,
  });

  assert.equal(scope.source, 'explicit');
  assert.equal(scope.base, 'base-sha');
  assert.equal(scope.head, 'head-sha');
  assert.deepEqual(git.calls[0], ['rev-parse', '--verify', 'base^{commit}']);
});

test('uses merge-request SHAs when explicit refs are absent', async () => {
  const responses = new Map([
    [['rev-parse', '--verify', 'ci-base^{commit}'].join('\0'), 'ci-base-sha\n'],
    [['rev-parse', '--verify', 'ci-head^{commit}'].join('\0'), 'ci-head-sha\n'],
    [
      [
        'diff',
        '--name-only',
        '--diff-filter=ACDMRTUXB',
        'ci-base-sha...ci-head-sha',
      ].join('\0'),
      '',
    ],
    [
      ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB'].join('\0'),
      '',
    ],
    [['diff', '--name-only', '--diff-filter=ACDMRTUXB'].join('\0'), ''],
    [['ls-files', '--others', '--exclude-standard'].join('\0'), ''],
  ]);
  const scope = await inspectChangeScope({
    cwd: '/repo',
    args: {},
    env: {
      CI_MERGE_REQUEST_DIFF_BASE_SHA: 'ci-base',
      CI_COMMIT_SHA: 'ci-head',
    },
    runGit: createGit(responses).runGit,
    findPackage: async () => null,
  });

  assert.equal(scope.source, 'ci-merge-request');
  assert.equal(scope.base, 'ci-base-sha');
  assert.equal(scope.head, 'ci-head-sha');
});

test('combines range, staged, unstaged, and untracked paths without duplicates', async () => {
  const responses = explicitResponses('src/a.ts\nsrc/shared.ts\n');
  responses.set(
    ['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB'].join('\0'),
    'src/staged.ts\nsrc/shared.ts\n',
  );
  responses.set(
    ['diff', '--name-only', '--diff-filter=ACDMRTUXB'].join('\0'),
    'src/unstaged.ts\n',
  );
  responses.set(
    ['ls-files', '--others', '--exclude-standard'].join('\0'),
    'src/untracked.ts\n',
  );

  const scope = await inspectChangeScope({
    cwd: '/repo',
    args: { base: 'base', head: 'head' },
    env: {},
    runGit: createGit(responses).runGit,
    findPackage: async () => null,
  });

  assert.deepEqual(scope.changedFiles, [
    'src/a.ts',
    'src/shared.ts',
    'src/staged.ts',
    'src/unstaged.ts',
    'src/untracked.ts',
  ]);
});

test('finds and deduplicates affected workspace packages', async () => {
  const responses = explicitResponses(
    'platform/backend/services/auth/src/a.ts\nplatform/backend/services/auth/src/b.ts\nplatform/frontend/apps/shell/src/App.tsx\n',
  );
  const findPackage = async (file) =>
    file.includes('/auth/')
      ? { name: '@wfe/auth-service', path: 'platform/backend/services/auth' }
      : { name: '@wfe/shell', path: 'platform/frontend/apps/shell' };

  const scope = await inspectChangeScope({
    cwd: '/repo',
    args: { base: 'base', head: 'head' },
    env: {},
    runGit: createGit(responses).runGit,
    findPackage,
  });

  assert.deepEqual(scope.affectedPackages, [
    { name: '@wfe/auth-service', path: 'platform/backend/services/auth' },
    { name: '@wfe/shell', path: 'platform/frontend/apps/shell' },
  ]);
});

test('classifies all supported change categories', () => {
  const files = [
    'platform/backend/services/auth/src/security/secret.ts',
    'platform/frontend/apps/shell/src/api/public-api.ts',
    'modules/users/backend/drizzle/0001.sql',
    'platform/frontend/apps/shell/src/i18n/en.json',
    'platform/backend/services/auth/.env.example',
    'platform/backend/services/auth/api/openapi.yaml',
    'platform/backend/shared/lib/src/index.ts',
    'platform/frontend/infra/k8s/Dockerfile',
  ];
  const categories = new Set(files.flatMap((file) => classifyPath(file).categories));

  assert.deepEqual(
    [...categories].sort(),
    [
      'backend',
      'container-deployment',
      'environment',
      'frontend',
      'localization',
      'migration',
      'public-api',
      'security',
      'shared-library',
      'swagger',
    ],
  );
});

test('flags central and nested quality configuration paths as protected', () => {
  const protectedFiles = [
    '.gitlab/ci/sonarqube.yml',
    '.gitlab-ci.yml',
    'scripts/ci/run-mr-quality-gate.cjs',
    'sonar-project.properties',
    'platform/backend/services/auth/.gitlab-ci.yml',
  ];

  for (const file of protectedFiles) {
    assert.equal(classifyPath(file).protected, true, file);
  }
  assert.equal(
    classifyPath('platform/backend/services/auth/src/index.ts').protected,
    false,
  );
});

test('returns an empty valid scope for an empty diff', async () => {
  const scope = await inspectChangeScope({
    cwd: '/repo',
    args: { base: 'base', head: 'head' },
    env: {},
    runGit: createGit(explicitResponses()).runGit,
    findPackage: async () => null,
  });

  assert.deepEqual(scope.changedFiles, []);
  assert.deepEqual(scope.categories, []);
  assert.deepEqual(scope.recommendedChecks, []);
});

test('rejects an unverifiable comparison range', async () => {
  const git = createGit(
    new Map([
      [
        ['rev-parse', '--verify', 'missing^{commit}'].join('\0'),
        new Error('unknown revision'),
      ],
    ]),
  );

  await assert.rejects(
    inspectChangeScope({
      cwd: '/repo',
      args: { base: 'missing', head: 'HEAD' },
      env: {},
      runGit: git.runGit,
      findPackage: async () => null,
    }),
    /Unable to verify base ref/,
  );
});

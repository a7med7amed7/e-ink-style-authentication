import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unlink, writeFile } from 'node:fs/promises';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiRoot = join(repositoryRoot, 'apps', 'api');
const requestedPath = process.argv[2];

if (process.argv.length > 3) {
  console.error('Usage: node scripts/build-api-test.mjs [apps/api/test/<suite>.ts]');
  process.exit(2);
}

const requireFromRoot = createRequire(join(repositoryRoot, 'package.json'));
const tscPath = requireFromRoot.resolve('typescript/bin/tsc');
let configPath = join(apiRoot, 'tsconfig.test.json');
let temporaryConfigPath;

try {
  if (requestedPath) {
    const entryPath = isAbsolute(requestedPath)
      ? resolve(requestedPath)
      : resolve(repositoryRoot, requestedPath);
    const entryFromTestRoot = relative(join(apiRoot, 'test'), entryPath);
    const suiteName = entryFromTestRoot.slice(0, -extname(entryPath).length);

    if (
      !entryFromTestRoot ||
      isAbsolute(entryFromTestRoot) ||
      entryFromTestRoot === '..' ||
      entryFromTestRoot.startsWith(`..${sep}`) ||
      entryFromTestRoot.includes(sep) ||
      extname(entryPath) !== '.ts' ||
      !/^[A-Za-z0-9._-]+$/.test(suiteName) ||
      suiteName === '.' ||
      suiteName === '..'
    ) {
      console.error('Test target must be a TypeScript file directly under apps/api/test/.');
      process.exit(2);
    }

    const temporaryName = `.tsconfig.test-target-${process.pid}-${randomUUID()}.json`;
    temporaryConfigPath = join(apiRoot, temporaryName);
    configPath = temporaryConfigPath;
    const entryRelative = relative(apiRoot, entryPath).split(sep).join('/');

    await writeFile(
      temporaryConfigPath,
      `${JSON.stringify(
        {
          extends: './tsconfig.test.json',
          compilerOptions: {
            rootDir: '.',
            outDir: `./dist-test/targets/${suiteName}`,
            incremental: false,
            noEmit: false
          },
          files: [`./${entryRelative}`],
          include: ['./src/types/**/*.d.ts'],
          exclude: []
        },
        null,
        2
      )}\n`,
      'utf8'
    );
  }

  const result = spawnSync(process.execPath, [tscPath, '--pretty', 'false', '-p', configPath], {
    cwd: apiRoot,
    stdio: 'inherit'
  });

  if (result.error) throw result.error;
  if (result.signal) throw new Error(`TypeScript compiler terminated by ${result.signal}`);
  process.exitCode = result.status ?? 1;
} finally {
  if (temporaryConfigPath) await unlink(temporaryConfigPath);
}

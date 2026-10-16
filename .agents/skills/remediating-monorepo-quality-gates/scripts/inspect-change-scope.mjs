#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

import {
  inspectChangeScope,
  parseArgs,
} from './inspect-change-scope.lib.mjs';

function runGit(cwd) {
  return async (args) => {
    const result = spawnSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (result.status !== 0) {
      throw new Error(result.stderr.trim() || `git ${args[0]} failed`);
    }
    return result.stdout;
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  const scope = await inspectChangeScope({
    cwd: args.cwd,
    args,
    env: process.env,
    runGit: runGit(args.cwd),
  });
  process.stdout.write(`${JSON.stringify(scope, null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `inspect-change-scope: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}

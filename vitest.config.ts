import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  test: {
    projects: [
      {
        test: {
          name: 'shared',
          include: ['packages/auth-contract/test/**/*.test.ts'],
          environment: 'node'
        }
      },
      {
        test: {
          name: 'web',
          include: [
            'apps/web/test/**/*.test.ts',
            'apps/web/test/**/*.test.tsx'
          ],
          environment: 'jsdom'
        }
      }
    ]
  }
});

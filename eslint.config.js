import tseslint from 'typescript-eslint';

const javascriptFiles = ['**/*.{js,mjs,cjs}'];
const typescriptFiles = ['**/*.{ts,tsx,mts,cts}'];
const typeCheckedFiles = [
  'apps/api/**/*.ts',
  'apps/web/src/**/*.{ts,tsx}',
  'apps/web/test/**/*.{ts,tsx}',
  'apps/web/vite.config.ts',
  'packages/auth-contract/src/**/*.ts'
];
const typedProjects = [
  { files: ['apps/api/**/*.ts'], project: './apps/api/tsconfig.test.json' },
  {
    files: [
      'apps/web/src/**/*.{ts,tsx}',
      'apps/web/test/**/*.{ts,tsx}',
      'apps/web/vite.config.ts'
    ],
    project: './apps/web/tsconfig.json'
  },
  { files: ['packages/auth-contract/src/**/*.ts'], project: './packages/auth-contract/tsconfig.json' }
];

const scopeConfigs = (configs, files) => configs.map((config) => ({ ...config, files }));

export default tseslint.config(
  {
    ignores: [
      '**/.git/**',
      '**/node_modules/**',
      '**/dist/**',
      '**/dist-test/**',
      '**/coverage/**',
      '**/.nyc_output/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/vendor/**',
      '.agents/**',
      '.cursor/**',
      '.specify/**'
    ]
  },
  ...scopeConfigs(tseslint.configs.recommended, javascriptFiles),
  ...scopeConfigs(tseslint.configs.recommended, typescriptFiles),
  ...scopeConfigs(tseslint.configs.strictTypeChecked, typeCheckedFiles),
  ...typedProjects.map(({ files, project }) => ({
    files,
    languageOptions: {
      parserOptions: {
        project: [project],
        tsconfigRootDir: import.meta.dirname
      }
    }
  })),
  {
    files: typeCheckedFiles,
    rules: {
      '@typescript-eslint/ban-ts-comment': 'error',
      '@typescript-eslint/no-explicit-any': 'error'
    }
  }
);

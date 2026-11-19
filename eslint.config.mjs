import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/.next/**',
      '**/node_modules/**',
      '**/coverage/**',
      'e2e/test-results/**',
      'e2e/playwright-report/**',
      'apps/web/next-env.d.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // consistent-type-imports is intentionally NOT enabled: NestJS DI needs runtime imports of
      // classes that look type-only, and the auto-fix would silently break injection.
      'no-console': ['error', { allow: ['error', 'warn'] }],
      eqeqeq: ['error', 'always'],
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
  },
  {
    // Operator CLIs legitimately print to stdout.
    files: ['apps/api/src/cli/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: [
      '**/*.spec.ts',
      '**/*.int-spec.ts',
      '**/*.test.ts',
      '**/*.test.tsx',
      'apps/api/test/**/*.ts',
    ],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' },
  },
  { files: ['**/*.js'], rules: { '@typescript-eslint/no-require-imports': 'off' } },
  prettier,
);

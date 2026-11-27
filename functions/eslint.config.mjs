// functions/eslint.config.mjs
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.ts'],
    extends: [
      ...tseslint.configs.recommendedTypeChecked,
      ...tseslint.configs.strictTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.eslint.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
        },
      ],
    },
  },
  {
    // A function is defined through src/shared/define/, which records the name
    // it is exported under — the name a gateway routes by (plan
    // cloud-run-gateways). deleteAccount.ts moves once its rework lands.
    files: ['src/**/*.ts'],
    ignores: ['src/**/__tests__/**', 'src/shared/define/**', 'src/account/deleteAccount.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'firebase-functions/v2/https',
              importNames: ['onCall'],
              message: 'Define a callable with defineCallable from src/shared/define/defineCallable.',
            },
          ],
        },
      ],
    },
  },
  {
    // firebase-functions-test returns untyped helper objects (wrap, makeChange,
    // firestore, cleanup) plus snapshot.data() — its TS types are effectively
    // `any` at the SDK boundary. These test files legitimately fake SDK shapes,
    // so relax the no-unsafe-* family here. Production-style rules (no-explicit-any,
    // template-expressions, etc.) still apply.
    files: ['src/__tests__/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unnecessary-type-assertion': 'off',
    },
  },
  {
    ignores: ['lib/**', 'dist/**', 'node_modules/**', 'coverage/**'],
  },
);

// functions/eslint.config.mjs
import tseslint from 'typescript-eslint';
import { BARE_FIREBASE_ERROR_CODE_COMPARE } from '../packages/shared/eslint/bareFirebaseErrorCode.mjs';

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
    // cloud-run-gateways).
    files: ['src/**/*.ts'],
    ignores: ['src/**/__tests__/**', 'src/shared/define/**'],
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
            {
              name: 'firebase-functions/v2/https',
              importNames: ['onRequest'],
              message: 'Define an HTTP function with defineHttpFunction from src/shared/define/defineHttpFunction.',
            },
            {
              name: 'firebase-functions/v2/firestore',
              importNames: ['onDocumentCreated', 'onDocumentUpdated', 'onDocumentDeleted', 'onDocumentWritten'],
              message: 'Define a Firestore trigger with defineDocumentTrigger from src/shared/define/defineDocumentTrigger.',
            },
            {
              name: 'firebase-functions/v2/scheduler',
              importNames: ['onSchedule'],
              message: 'Define a scheduled function with defineSchedule from src/shared/define/defineSchedule.',
            },
            {
              name: 'firebase-functions/v2/storage',
              importNames: ['onObjectFinalized', 'onObjectDeleted', 'onObjectArchived', 'onObjectMetadataUpdated'],
              message: 'Define a Storage trigger from src/shared/define/defineStorageTrigger.',
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
    // A Firebase error code is compared only through firebaseErrorCode()
    // (packages/shared/eslint/bareFirebaseErrorCode.mjs).
    files: ['src/**/*.ts'],
    rules: { 'no-restricted-syntax': ['error', BARE_FIREBASE_ERROR_CODE_COMPARE] },
  },
  {
    ignores: ['lib/**', 'dist/**', 'node_modules/**', 'coverage/**'],
  },
);

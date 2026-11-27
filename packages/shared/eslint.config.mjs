// packages/shared/eslint.config.mjs
import tseslint from 'typescript-eslint';

const SDK_SEAM_PATTERN = {
  group: ['firebase/*', '@firebase/*', '@react-native-firebase/*'],
  allowTypeImports: true,
  message: 'Import Firebase from src/firebase/sdk/* instead.',
};

const CALLABLE_TRANSPORT_PATTERN = {
  group: ['**/sdk/functions'],
  importNames: ['httpsCallable', 'httpsCallableFromURL'],
  message: 'Reach a callable with getCallable from services/callableTransport.',
};

export default tseslint.config(
  {
    files: ['src/**/*.ts', 'test/**/*.ts'],
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
    // Client Firebase goes through the SDK seam (src/firebase/sdk/README.md):
    // the app runs its native twins, and a direct `firebase/*` import would put
    // the JS SDK back in the bundle — signed out, since native Auth holds the
    // session. Type-only imports are erased, so they stay allowed.
    files: ['src/**/*.ts'],
    ignores: ['src/firebase/sdk/**', 'src/firebase/firebaseApp*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [SDK_SEAM_PATTERN, CALLABLE_TRANSPORT_PATTERN],
        },
      ],
    },
  },
  {
    // The one module that builds a callable: it picks the gateway or the
    // callable's own service (services/callableTransport.ts).
    files: ['src/services/callableTransport.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [SDK_SEAM_PATTERN] }],
    },
  },
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**'],
  },
);

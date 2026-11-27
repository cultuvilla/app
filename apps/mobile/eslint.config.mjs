// apps/mobile/eslint.config.mjs
//
// Invariant rules only (AGENTS.md invariants 1 and 5), not a style ruleset:
// no Firebase outside the SDK seam and the boundary files, no `any`, the
// rules of hooks, and no `eslint-disable` that outlives its rule. Not
// type-checked — none of these rules needs type information.
// In tests: no focused test, and no test that asserts nothing.
// Pinned by packages/shared/test/eslint/appLintRules.test.ts.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import jestPlugin from 'eslint-plugin-jest';
import { BARE_FIREBASE_ERROR_CODE_COMPARE } from '../../packages/shared/eslint/bareFirebaseErrorCode.mjs';

// Regexes, not gitignore globs: a bare `firebase` glob matches at any depth,
// so it would also catch `@cultuvilla/shared/firebase` and `./firebase`.
export const RAW_SDK = '^(firebase|@firebase|@react-native-firebase)(/.*)?$';
// `sdk/errors` (firebaseErrorCode) is sanctioned for app code.
export const SEAM_INTERNALS = '^@cultuvilla/shared/firebase/(sdk/(?!errors$)|refs/)';

const rawSdkPattern = {
  regex: RAW_SDK,
  allowTypeImports: false,
  message: 'Reach Firebase through a service in @cultuvilla/shared/services (types: @cultuvilla/shared/firebase).',
};
const seamPattern = {
  regex: SEAM_INTERNALS,
  allowTypeImports: false,
  message: 'App code reaches Firebase through a service, not the SDK seam or its refs.',
};

// Own both the raw SDKs and the seam: the auth boundary and the bootstrap.
export const BOUNDARY = ['lib/auth/AuthContext.tsx', 'lib/firebaseInit.ts'];
// May import a raw SDK: build config, App Check, and native analytics, which
// has no seam twin.
export const RAW_SDK_EXEMPT = [
  'app.config.ts',
  'lib/appCheck.ts',
  'lib/observability/analytics.ts',
  'lib/observability/__tests__/analytics.native.test.ts',
];
// Today's importers of seam internals. Moving errorBridge and useOwnerSummary
// behind a service is a follow-up; a new entry here is a visible diff.
export const SEAM_ALLOWLIST = [
  'lib/auth/**',
  'lib/observability/errorBridge.ts',
  'lib/useOwnerSummary.ts',
  'lib/__tests__/useOwnerSummary.test.ts',
  'components/feature/__tests__/LiveAvatar.test.tsx',
];

export const TEST_FILES = ['**/__tests__/**/*.{ts,tsx}', '**/*.test.{ts,tsx}'];

const restrictImports = (...patterns) => ({
  '@typescript-eslint/no-restricted-imports': ['error', { patterns }],
});

export default tseslint.config(
  {
    ignores: ['.expo/**', 'android/**', 'ios/**', 'dist/**', 'node_modules/**', 'coverage/**', '**/*.js'],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin, 'react-hooks': reactHooks },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      'react-hooks/rules-of-hooks': 'error',
      // Off: switched on, it reports 28 findings beyond the 14 call sites that
      // were silencing it, and fixing them changes when effects run.
      'react-hooks/exhaustive-deps': 'off',
      // Through firebaseErrorCode() only (packages/shared/eslint/bareFirebaseErrorCode.mjs).
      'no-restricted-syntax': ['error', BARE_FIREBASE_ERROR_CODE_COMPARE],
      ...restrictImports(rawSdkPattern, seamPattern),
    },
  },
  {
    // A committed `.only` silently skips every other test in its file, and a
    // test with no assertion passes whatever the code does.
    files: TEST_FILES,
    plugins: { jest: jestPlugin },
    rules: {
      'jest/no-focused-tests': 'error',
      // findBy* throws when nothing matches, so it is an assertion too.
      'jest/expect-expect': ['error', { assertFunctionNames: ['expect', 'findBy*', 'findAllBy*'] }],
    },
  },
  { files: SEAM_ALLOWLIST, rules: restrictImports(rawSdkPattern) },
  { files: RAW_SDK_EXEMPT, rules: restrictImports(seamPattern) },
  { files: BOUNDARY, rules: { '@typescript-eslint/no-restricted-imports': 'off' } },
);

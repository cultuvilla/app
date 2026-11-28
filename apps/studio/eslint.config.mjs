// apps/studio/eslint.config.mjs
//
// The mobile app's invariant rules (apps/mobile/eslint.config.mjs), applied to
// the web studio: no Firebase outside its auth boundary, no `any`, the rules
// of hooks, and no `eslint-disable` that outlives its rule.
// Pinned by packages/shared/test/eslint/appLintRules.test.ts.
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { BARE_FIREBASE_ERROR_CODE_COMPARE } from '../../packages/shared/eslint/bareFirebaseErrorCode.mjs';

export const RAW_SDK = '^(firebase|@firebase|@react-native-firebase)(/.*)?$';
export const SEAM_INTERNALS = '^@cultuvilla/shared/firebase/(sdk/(?!errors$)|refs/)';

// The studio's auth boundary, counterpart of the app's AuthContext.tsx.
export const BOUNDARY = ['src/auth/StudioAuth.tsx'];

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'coverage/**', '**/*.js'],
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
      'react-hooks/exhaustive-deps': 'off',
      // Through firebaseErrorCode() only (packages/shared/eslint/bareFirebaseErrorCode.mjs).
      'no-restricted-syntax': ['error', BARE_FIREBASE_ERROR_CODE_COMPARE],
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: RAW_SDK,
              allowTypeImports: false,
              message: 'Reach Firebase through a service in @cultuvilla/shared/services (types: @cultuvilla/shared/firebase).',
            },
            {
              regex: SEAM_INTERNALS,
              allowTypeImports: false,
              message: 'Studio code reaches Firebase through a service, not the SDK seam or its refs.',
            },
          ],
        },
      ],
    },
  },
  { files: BOUNDARY, rules: { '@typescript-eslint/no-restricted-imports': 'off' } },
);

const path = require('node:path');

// ExcelJS (used by the roster export) pulls uuid@8, whose "browser" field
// points at an ESM build that jest's CJS runtime can't parse. Point jest at
// uuid's CJS entry instead; the web bundle is unaffected (Metro takes ExcelJS's
// prebundled browser dist).
const uuidCjs = require.resolve('uuid', { paths: [path.dirname(require.resolve('exceljs'))] });

module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  // Playwright specs under e2e/ use @playwright/test's runner, not jest — jest
  // must not try to execute them (it would fail parsing test.describe/expect).
  testPathIgnorePatterns: ['/node_modules/', '<rootDir>/e2e/'],
  // jest-expo render suites are heavy (~12-15s each) and run in parallel; the
  // default 5000ms per-test limit is too tight under CI contention and flakes
  // (e.g. complete-profile timing out). 15s gives headroom without hiding hangs.
  testTimeout: 15000,
  // pnpm stores packages under .pnpm/; include it so nested ESM packages get transpiled
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@cultuvilla|nativewind|firebase|@firebase))',
  ],
  // babel-jest only matches [jt]sx? by default; add .mjs so firebase's postinstall.mjs is transpiled
  transform: { '\\.mjs$': 'babel-jest' },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    // jest-expo's preset hard-codes `<rootDir>/packages/shared/src/$1`, which
    // assumes shared lives inside this app. In our monorepo it's at the
    // workspace root, so we override here.
    '^@cultuvilla/shared$': '<rootDir>/../../packages/shared/src',
    '^@cultuvilla/shared/(.*)$': '<rootDir>/../../packages/shared/src/$1',
    // @cultuvilla/i18n's entry is index.ts at the package root (no src/ dir).
    '^@cultuvilla/i18n$': '<rootDir>/../../packages/i18n/index',
    '^@cultuvilla/i18n/(.*)$': '<rootDir>/../../packages/i18n/$1',
    '^uuid$': uuidCjs,
    // The native Firebase SDKs have no JS implementation under jest. Mapped
    // here, not jest.mock'd, because packages/shared resolves them through a
    // different pnpm path than this app and a jest.mock keys on the path.
    '^@react-native-firebase/app$': '<rootDir>/test/mocks/rnfbApp.ts',
    '^@react-native-firebase/auth$': '<rootDir>/test/mocks/rnfbAuth.ts',
    '^@react-native-firebase/firestore$': '<rootDir>/test/mocks/rnfbFirestore.ts',
    '^@react-native-firebase/functions$': '<rootDir>/test/mocks/rnfbFunctions.ts',
    '^@react-native-firebase/storage$': '<rootDir>/test/mocks/rnfbStorage.ts',
  },
  // Report-only coverage (docs/plans/ongoing/testing-enhancement.md, D4): only
  // collected with `pnpm app:test:coverage` (jest --coverage); no gate yet.
  // v8 + lcov keeps the output format aligned with the vitest packages so a
  // future diff-cover step can merge one lcov set across the monorepo.
  coverageProvider: 'v8',
  coverageReporters: ['text-summary', 'lcov'],
  collectCoverageFrom: ['lib/**/*.ts', 'components/**/*.{ts,tsx}'],
};

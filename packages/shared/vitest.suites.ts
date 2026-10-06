// The one list of which test files each vitest config runs. The unit config
// (CI's `test:unit`) and the all-in-one config (local `pnpm test`, under
// emulators) used to keep separate copies; the all-in-one copy silently lost
// test/ci and test/firestore, so the local gate skipped tests CI ran.
// test/ci/testGateParity.test.ts fails if a test directory is left out.

export const UNIT_INCLUDE = [
  'test/config/**/*.test.ts',
  'test/models/**/*.test.ts',
  'test/services/**/*.test.ts',
  'test/firebase/**/*.test.ts',
  'test/firestore/**/*.test.ts',
  'test/eslint/**/*.test.ts',
  'test/export/**/*.test.ts',
  'test/design-system/**/*.test.ts',
  'test/email/**/*.test.ts',
  'test/utils/**/*.test.ts',
  'test/wrapped/**/*.test.ts',
  'test/validation/**/*.test.ts',
  'test/ci/**/*.test.ts',
];

export const INTEGRATION_INCLUDE = ['test/integration/**/*.test.ts'];

export const E2E_INCLUDE = ['test/e2e/**/*.test.ts'];

export const ALL_INCLUDE = [...UNIT_INCLUDE, ...INTEGRATION_INCLUDE, ...E2E_INCLUDE];

// Placeholder env so test files that import the shared `firebase` entry (which
// initializes Auth via getFirebaseConfig at module load) don't fail. No network
// calls are made; these values only satisfy the fail-fast checks in
// src/config/environments.ts.
export const TEST_ENV = {
  NEXT_PUBLIC_APP_ENV: 'dev',
  NEXT_PUBLIC_FIREBASE_API_KEY_DEV: 'AIzaSyTEST_DUMMY_PLACEHOLDER_KEY_0000000',
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN_DEV: 'test.example.com',
  NEXT_PUBLIC_FIREBASE_PROJECT_ID_DEV: 'test-project',
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET_DEV: 'test.appspot.com',
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID_DEV: '0',
  NEXT_PUBLIC_FIREBASE_APP_ID_DEV: 'test-app-id',
};

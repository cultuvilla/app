import { defineConfig } from 'vitest/config';
import { ALL_INCLUDE, TEST_ENV } from './vitest.suites';

// Runs every test category in @cultuvilla/shared under a single vitest
// invocation. Intended for orchestration by scripts/run-tests-with-emulators.mjs
// where the Firebase emulator suite is already running. Standalone use also
// works but the emulator must be up for integration/e2e tests to pass.
const RETRY = Number.parseInt(process.env.VITEST_RETRY_COUNT ?? '0', 10);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: TEST_ENV,
    include: ALL_INCLUDE,
    setupFiles: [
      'test/setup/integration.setup.ts',
      'test/setup/e2e.setup.ts',
    ],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    maxConcurrency: 1,
    retry: Number.isFinite(RETRY) && RETRY > 0 ? RETRY : 0,
    // Report-only coverage (docs/plans/ongoing/testing-enhancement.md, D4). This
    // full-picture config (unit + integration + e2e under emulators) produces the
    // lcov CI would feed to diff-cover once a patch-coverage gate lands.
    coverage: {
      enabled: false,
      provider: 'v8',
      reporter: ['text-summary', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts'],
      all: true,
    },
  },
});

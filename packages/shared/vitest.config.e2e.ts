import { defineConfig } from 'vitest/config';
import { E2E_INCLUDE } from './vitest.suites';

const RETRY = Number.parseInt(process.env.VITEST_RETRY_COUNT ?? '0', 10);

// E2E tests in @cultuvilla/shared: Firestore Security Rules.
// Uses @firebase/rules-unit-testing against the firestore emulator.
// Run with: pnpm test:rules  (orchestrated by scripts/run-tests-with-emulators.mjs)
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: E2E_INCLUDE,
    retry: Number.isFinite(RETRY) && RETRY > 0 ? RETRY : 0,
    setupFiles: ['test/setup/e2e.setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
    maxConcurrency: 1,
    // Report-only coverage (docs/plans/ongoing/testing-enhancement.md, D4).
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

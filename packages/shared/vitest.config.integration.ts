import { defineConfig } from 'vitest/config';
import { INTEGRATION_INCLUDE } from './vitest.suites';

const RETRY = Number.parseInt(process.env.VITEST_RETRY_COUNT ?? '0', 10);

// Integration tests in @cultuvilla/shared.
// Hits the Firebase Emulator Suite (Firestore + Auth) via the client SDK.
// Run with: pnpm test:integration  (orchestrated by scripts/run-tests-with-emulators.mjs)
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: INTEGRATION_INCLUDE,
    retry: Number.isFinite(RETRY) && RETRY > 0 ? RETRY : 0,
    setupFiles: ['test/setup/integration.setup.ts'],
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

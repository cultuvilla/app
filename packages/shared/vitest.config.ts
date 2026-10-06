import { defineConfig } from 'vitest/config';
import { TEST_ENV, UNIT_INCLUDE } from './vitest.suites';

const RETRY = Number.parseInt(process.env.VITEST_RETRY_COUNT ?? '0', 10);

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: TEST_ENV,
    // Integration and e2e suites have their own configs.
    include: UNIT_INCLUDE,
    retry: Number.isFinite(RETRY) && RETRY > 0 ? RETRY : 0,
    // Report-only (D4 in docs/plans/ongoing/testing-enhancement.md): coverage is
    // collected only when --coverage is passed; there is no threshold gate yet.
    // `all: true` reports untested src files as 0% instead of omitting them.
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

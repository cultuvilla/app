// Shared harness for emulator-backed Firestore tests (rules e2e + data
// integration). Mounts the live `firestore.rules` file against the Firestore
// emulator via @firebase/rules-unit-testing so every suite tests the *same*
// rules that ship, without each file re-implementing the readFileSync + env +
// lifecycle boilerplate.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, relative, resolve, sep } from 'node:path';
import { beforeAll, beforeEach, afterAll, expect } from 'vitest';
import {
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

// firestore.rules lives at the repo root — four levels above this helper
// (packages/shared/test/helpers/ → repo root).
const RULES_PATH = resolve(__dirname, '../../../../firestore.rules');

// One top-level condition of the emulator's rule coverage report: an `allow`
// condition or a function body, with how often it returned true, false, or
// failed to evaluate (a null dereference — denied, but not a refusal the
// condition chose).
export interface RulesCoverageEntry {
  line: number;
  column: number;
  trueCount: number;
  falseCount: number;
  errorCount: number;
}

interface CoverageValue {
  value?: { boolValue?: boolean };
  count?: number;
}

interface CoverageNode {
  sourcePosition: { line: number; column: number };
  values?: CoverageValue[];
}

/**
 * Save this file's rule coverage for scripts/check-rules-coverage.mjs. Reloading
 * the rules (once per test file) resets the emulator's report, so it has to be
 * read per file, before `cleanup()`. Only `test/e2e/` counts: the ratchet is
 * what `pnpm test:rules` proves, whichever config runs it.
 */
async function saveRulesCoverage(env: RulesTestEnvironment, dir: string): Promise<void> {
  const testPath = expect.getState().testPath;
  if (!testPath || !testPath.split(sep).join('/').includes('/test/e2e/')) return;
  const host = env.emulators.firestore;
  if (!host) return;
  const url = `http://${host.host}:${String(host.port)}/emulator/v1/projects/${env.projectId}:ruleCoverage`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`rule coverage: ${url} answered ${String(res.status)}`);
  const report = (await res.json()) as { report?: CoverageNode[] };
  const entries: RulesCoverageEntry[] = (report.report ?? []).map((node) => {
    let trueCount = 0;
    let falseCount = 0;
    let errorCount = 0;
    for (const v of node.values ?? []) {
      if (v.value?.boolValue === true) trueCount += v.count ?? 0;
      else if (v.value?.boolValue === false) falseCount += v.count ?? 0;
      else errorCount += v.count ?? 0;
    }
    const { line, column } = node.sourcePosition;
    return { line, column, trueCount, falseCount, errorCount };
  });
  mkdirSync(dir, { recursive: true });
  const name = relative(resolve(__dirname, '..'), testPath).split(sep).join('__');
  writeFileSync(resolve(dir, `${basename(name)}.json`), JSON.stringify({ file: name, entries }));
}

function resolveProjectId(explicit?: string): string {
  return explicit ?? process.env.TEST_PROJECT_ID ?? 'cultuvilla-rules-test';
}

/**
 * Build a one-off RulesTestEnvironment. Prefer {@link useRulesTestEnv} in test
 * files; reach for this only when you need manual control over the lifecycle.
 */
export async function createRulesTestEnv(projectId?: string): Promise<RulesTestEnvironment> {
  const rules = readFileSync(RULES_PATH, 'utf8');
  return initializeTestEnvironment({
    projectId: resolveProjectId(projectId),
    firestore: { rules },
  });
}

/**
 * Register the standard emulator-test lifecycle for the current suite:
 * initialize once (`beforeAll`), reset Firestore between tests (`beforeEach`),
 * and clean up at the end (`afterAll`), saving rule coverage first when
 * RULES_COVERAGE_DIR is set. Returns a getter for the live env.
 *
 * Call at the top level of a `describe`/module so the hooks register during
 * collection:
 *
 * ```ts
 * const getEnv = useRulesTestEnv();
 * it('...', () => { const db = asUser(getEnv(), 'alice'); ... });
 * ```
 */
export function useRulesTestEnv(projectId?: string): () => RulesTestEnvironment {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await createRulesTestEnv(projectId);
  });

  beforeEach(async () => {
    await env.clearFirestore();
  });

  afterAll(async () => {
    const coverageDir = process.env.RULES_COVERAGE_DIR;
    if (coverageDir) await saveRulesCoverage(env, resolve(coverageDir));
    await env.cleanup();
  });

  return () => env;
}

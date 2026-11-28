/**
 * Loads the Functions emulator's worker for each callable a run's flows wait
 * on, before the first flow, so no flow's UI wait pays for a worker boot.
 *
 * The emulator starts a worker per function on its first call. On a loaded
 * macOS runner that call queued 53 s and outlasted flow 12's 60 s wait for
 * "Enviado a" (ios-e2e 44826311824), while the next, warm call took 2.6 s.
 * Production cold starts take seconds, so warming hides nothing a user sees;
 * the flows still make every real call.
 *
 * The warm call is one the callable protocol rejects before any handler runs
 * (a body with no `data`), so it has no side effect whatever the callable does.
 * Warming is best effort: a failure is announced and the run goes on, slower.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

/** Every callable here is defined in the functions' default region. */
export const WARM_REGION = 'us-central1';

/** `apps/mobile/e2e/native/callables.json`: flow file → callables it waits on. */
export function readFlowCallables(suiteDir) {
  return JSON.parse(readFileSync(path.join(suiteDir, 'callables.json'), 'utf8')).flows;
}

/** The callables `flows` wait on, each once, in first-use order. */
export function callablesToWarm(flows, flowCallables) {
  return [...new Set(flows.flatMap((flow) => flowCallables[flow] ?? []))];
}

/**
 * Calls each callable once, one at a time: in parallel the worker boots would
 * compete for the runner's three cores and each take as long as the 53 s
 * they are meant to remove from a flow.
 */
export async function warmCallables({
  label,
  names,
  host,
  project,
  fetchImpl = fetch,
  log = console,
  loadBudgetMs = 120_000,
  retryDelayMs = 2_000,
}) {
  if (names.length === 0) return { warmed: [], failed: [] };
  if (!host) {
    log.warn(`[${label}] !! no Functions emulator host, so ${names.length} callable(s) start cold in their flows`);
    return { warmed: [], failed: names };
  }
  const warmed = [];
  const failed = [];
  const began = Date.now();
  for (const name of names) {
    const url = `http://${host}/${project}/${WARM_REGION}/${name}`;
    try {
      let res;
      for (;;) {
        res = await fetchImpl(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{}',
          signal: AbortSignal.timeout(180_000),
        });
        // The emulator answers 404 until it has loaded the functions'
        // definitions, which can finish after its ports are already open.
        if (res.status !== 404 || Date.now() - began >= loadBudgetMs) break;
        await new Promise((r) => setTimeout(r, retryDelayMs));
      }
      // 400 is the callable protocol refusing the empty body: the worker answered.
      if (res.status === 400) warmed.push(name);
      else failed.push(`${name} (HTTP ${res.status})`);
    } catch (error) {
      failed.push(`${name} (${error.message})`);
    }
  }
  log.log(`[${label}] warmed ${warmed.length} callable worker(s) in ${Date.now() - began} ms: ${warmed.join(', ')}`);
  if (failed.length) log.warn(`[${label}] !! could not warm, so these start cold: ${failed.join(', ')}`);
  return { warmed, failed };
}

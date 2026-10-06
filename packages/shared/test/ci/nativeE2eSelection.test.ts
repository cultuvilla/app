import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Running only some native E2E flows — locally (`E2E_NATIVE_FLOW=20,22`) or on
// CI (`pnpm e2e:ci:ios -f flows=20,22`) — on both platforms, through the one
// shared resolver in scripts/lib/maestro-suite.mjs.

const repoRoot = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(repoRoot, p), 'utf8');
const discovered = readdirSync(resolve(repoRoot, 'apps/mobile/e2e/native/flows'))
  .filter((f) => f.endsWith('.yaml'))
  .sort();

interface Selection {
  flows: string[];
  unknown: string[];
}
const { selectFlows, shardFlows } = (await import(
  pathToFileURL(resolve(repoRoot, 'scripts/lib/maestro-suite.mjs')).href
)) as {
  selectFlows: (discovered: string[], selection: string) => Selection;
  shardFlows: (flows: string[], shard: string) => string[];
};

describe('selectFlows', () => {
  it('takes numeric prefixes, names and filenames alike', () => {
    expect(selectFlows(discovered, '20').flows).toEqual(['20-register-to-event.yaml']);
    expect(selectFlows(discovered, '20-register-to-event').flows).toEqual(['20-register-to-event.yaml']);
    expect(selectFlows(discovered, '20-register-to-event.yaml').flows).toEqual([
      '20-register-to-event.yaml',
    ]);
  });

  // 22 unregisters what 20 registered: typed order must not reorder the run.
  it('runs a selection in filename order, whatever order it was typed in', () => {
    expect(selectFlows(discovered, ' 22 , 20 ').flows).toEqual([
      '20-register-to-event.yaml',
      '22-unregister-from-event.yaml',
    ]);
  });

  // A typo that quietly ran zero flows would read as a pass.
  it('reports a token that matches nothing instead of dropping it', () => {
    expect(selectFlows(discovered, '20,nope').unknown).toEqual(['nope']);
    // A prefix is a whole number, not a leading digit: `2` is not `20-…`.
    expect(selectFlows(discovered, '2').unknown).toEqual(['2']);
  });

  it('fails the run on an unknown token', () => {
    expect(read('scripts/lib/maestro-suite.mjs')).toMatch(
      /selection\?\.unknown\.length\)[\s\S]{0,300}process\.exit\(1\)/,
    );
  });
});

describe.each(['android', 'ios'])('%s-e2e flow selection on CI', (platform) => {
  const workflow = read(`.github/workflows/${platform}-e2e.yml`);
  const pkg = JSON.parse(read('package.json')) as { scripts: Record<string, string> };

  it('takes a `flows` input on manual dispatch, defaulting to the whole suite', () => {
    expect(workflow).toMatch(/workflow_dispatch:\s*\n\s*inputs:\s*\n\s*flows:[\s\S]*?default: ''/);
  });

  it('hands it to the runner the way a developer would locally', () => {
    expect(workflow).toContain('E2E_NATIVE_FLOW: ${{ inputs.flows }}');
    expect(read(`scripts/run-${platform}-e2e.mjs`)).toMatch(/process\.env\.E2E_NATIVE_FLOW/);
  });

  it('has a one-line dispatch shortcut', () => {
    expect(pkg.scripts[`e2e:ci:${platform}`]).toBe(`gh workflow run ${platform}-e2e.yml`);
  });
});

describe('shardFlows', () => {
  const shards = (n: number) =>
    Array.from({ length: n }, (_, i) => shardFlows(discovered, `${String(i + 1)}/${String(n)}`));

  it('covers every flow exactly once across the shards', () => {
    for (const n of [1, 2, 4]) {
      const all = shards(n).flat().sort();
      expect(all).toEqual(discovered);
    }
  });

  // Each shard starts from a fresh seed, so a split group would lose its earlier
  // half: 22 would find nothing of 20's to unregister.
  it('never splits a tens-group across shards', () => {
    const four = shards(4);
    for (const shard of four) {
      for (const other of four) {
        if (shard === other) continue;
        const groups = new Set(shard.map((f) => f.charAt(0)));
        expect(other.some((f) => groups.has(f.charAt(0)))).toBe(false);
      }
    }
  });

  it('keeps filename order within a shard, and is deterministic', () => {
    for (const shard of shards(4)) expect(shard).toEqual([...shard].sort());
    expect(shards(4)).toEqual(shards(4));
  });

  it('balances the load', () => {
    const sizes = shards(4).map((s) => s.length);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBeLessThanOrEqual(4);
  });

  it('rejects a malformed shard', () => {
    expect(() => shardFlows(discovered, '5/4')).toThrow(/E2E_SHARD/);
    expect(() => shardFlows(discovered, 'two')).toThrow(/E2E_SHARD/);
  });
});

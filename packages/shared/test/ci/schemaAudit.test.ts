import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import { Timestamp } from 'firebase-admin/firestore';
import { adminConverter } from '../../src/firebase/converters/sdkAdapters.admin';
import { normalizePath, unmodeledPaths } from '../../../../scripts/lib/conformance-walk.mjs';
import {
  ALLOWLIST_PATH,
  BASELINE_PATH,
  evaluate,
  ratchetGrowth,
  shrinkBaseline,
  validateAllowlist,
  validateBaseline,
} from '../../../../scripts/audit-firestore-schemas-policy.mjs';
import { censusRows, type FieldStats, tallyDoc } from '../../../../scripts/census-fields.mjs';

// The deploy's conformance gate checks stored data only when a promotion
// deploys. The weekly audit checks beta and prod in between, and ratchets the
// fields stored docs carry that no schema models (zod strips them on read, so
// they are invisible to readers and lost on the next converter write).

const repoRoot = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(repoRoot, p), 'utf-8');
const workflow = read('.github/workflows/firestore-schema-audit.yml');
const ci = read('.github/workflows/ci.yml');

const snap = (data: unknown) => ({ data: () => data });

describe('unmodeledPaths', () => {
  const schema = z.object({
    name: z.string(),
    createdAt: z.date(),
    address: z.object({ street: z.string() }),
    tags: z.array(z.object({ label: z.string() })),
    counts: z.record(z.string(), z.object({ n: z.number() })),
  });
  const converter = adminConverter(schema);

  it('finds keys the real converter drops, at any depth, and only those', () => {
    const raw = {
      name: 'x',
      legacy: true,
      createdAt: Timestamp.fromDate(new Date('2026-01-01')),
      address: { street: 's', zip: '1' },
      tags: [{ label: 'a', colour: 'red' }],
      counts: { abc123def456ghi: { n: 1, old: 2 } },
    };
    expect(unmodeledPaths(raw, converter.fromFirestore(snap(raw))).sort()).toEqual(
      ['address.zip', 'counts.*.old', 'legacy', 'tags[].colour'].sort(),
    );
  });

  it('treats Timestamps as leaves and reports nothing for a fully modeled doc', () => {
    const raw = { name: 'x', createdAt: Timestamp.now(), address: { street: 's' }, tags: [], counts: {} };
    expect(unmodeledPaths(raw, converter.fromFirestore(snap(raw)))).toEqual([]);
  });

  it('collapses ids and indices in issue paths', () => {
    expect(normalizePath('counts.abc123def456ghi.n')).toBe('counts.*.n');
    expect(normalizePath('tags.3.label')).toBe('tags[].label');
  });
});

const result = (over: Record<string, unknown> = {}) => ({
  projectId: 'p',
  targets: [{ path: 'events', total: 2, bad: [] as { id: string; issues: { path: string; code: string; message: string }[] }[] }],
  orphans: [],
  unmatched: [] as string[],
  undeclared: [] as string[],
  unmodeled: {} as Record<string, { count: number; example: string }>,
  ...over,
});

describe('evaluate', () => {
  const drift = result({
    targets: [{ path: 'events/{eventId}/registrations', total: 1, bad: [{ id: 'events/e/registrations/r', issues: [{ path: 'status', code: 'invalid_value', message: 'bad' }] }] }],
  });

  it('fails closed on schema drift, an undeclared root and an unmatched path', () => {
    const verdict = evaluate({ env: 'beta', result: { ...drift, undeclared: ['ghost'], unmatched: ['a/*/b'] }, allowlist: [], baseline: {} });
    expect(verdict.failures.map((f: { signature: string }) => f.signature)).toEqual([
      'schema-drift :: events/*/registrations :: status :: invalid_value',
      'unmatched-path :: a/*/b',
      'undeclared-root :: ghost',
    ]);
  });

  it('passes an allowlisted residual, only in the envs it names', () => {
    const allowlist = [{ signature: 'schema-drift :: events/*/registrations :: status :: invalid_value', reason: 'a legacy status, cleaned by #1', envs: ['prod'] }];
    expect(evaluate({ env: 'prod', result: drift, allowlist, baseline: {} }).failures).toEqual([]);
    expect(evaluate({ env: 'beta', result: drift, allowlist, baseline: {} }).failures).toHaveLength(1);
  });

  it('fails a newly unmodeled field and passes a baselined one; reports stale entries', () => {
    const r = result({ unmodeled: { 'events :: legacy': { count: 3, example: 'events/e' } } });
    expect(evaluate({ env: 'beta', result: r, allowlist: [], baseline: {} }).failures).toHaveLength(1);
    const ok = evaluate({ env: 'beta', result: r, allowlist: [], baseline: { beta: ['events :: legacy', 'events :: gone'] } });
    expect(ok.failures).toEqual([]);
    expect(ok.stale.baseline).toEqual(['events :: gone']);
  });
});

describe('the ratchet', () => {
  it('only ever shrinks a baseline', () => {
    expect(shrinkBaseline({ beta: ['a', 'b'], prod: ['c'] }, 'beta', ['b', 'new'])).toEqual({ beta: ['b'], prod: ['c'] });
  });

  it('flags growth against the base, but not a first recording', () => {
    expect(ratchetGrowth({ beta: ['a'], prod: [] }, { beta: ['a', 'b'], prod: ['c'] })).toEqual(['beta: b', 'prod: c']);
    expect(ratchetGrowth({ beta: ['a', 'b'], prod: [] }, { beta: ['a'], prod: [] })).toEqual([]);
    expect(ratchetGrowth(null, { beta: ['a'], prod: [] })).toEqual([]);
  });

  it('rejects an allowlist entry without a reason and an unsorted baseline', () => {
    expect(validateAllowlist([{ signature: 's', reason: '' }])).toHaveLength(1);
    expect(validateBaseline({ beta: ['b', 'a'] })).toHaveLength(1);
  });

  it('the committed allowlist and baseline are well-formed', () => {
    expect(validateAllowlist(JSON.parse(readFileSync(ALLOWLIST_PATH, 'utf-8')))).toEqual([]);
    expect(validateBaseline(JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')))).toEqual([]);
  });

  it('runs on every PR, in the job that has the base branch', () => {
    const job = ci.slice(ci.indexOf('  breaking-changes:'));
    expect(job).toContain('node scripts/audit-firestore-schemas-ratchet.mjs --base="origin/${BASE_REF}"');
  });
});

describe('the weekly workflow', () => {
  it('is scheduled weekly and dispatches itself onto beta and main', () => {
    expect(workflow).toMatch(/cron: "\d+ \d+ \* \* \d"/);
    expect(workflow).toContain('for ref in beta main; do');
    expect(workflow).toContain('gh workflow run firestore-schema-audit.yml --repo "${REPO}" --ref "${ref}"');
  });

  // A schedule runs on develop, and the beta/production environments admit
  // only their own branch, so the audit leg must run from the dispatched branch.
  it('audits only from beta or main, inside that branch\'s environment, keylessly', () => {
    const audit = workflow.slice(workflow.indexOf('  audit:'));
    expect(audit).toContain(`contains(fromJSON('["refs/heads/beta","refs/heads/main"]'), github.ref)`);
    expect(audit).toContain("environment: ${{ github.ref_name == 'main' && 'production' || 'beta' }}");
    expect(audit).toContain("AUDIT_ENV: ${{ github.ref_name == 'main' && 'prod' || 'beta' }}");
    expect(audit).toContain('id-token: write');
    expect(audit).toContain('workload_identity_provider: ${{ vars.GCP_WIF_PROVIDER }}');
    expect(audit).not.toMatch(/credentials_json|secrets\./);
    expect(audit).toContain('node scripts/audit-firestore-schemas.mjs --env="${AUDIT_ENV}"');
  });
});

describe('census:fields', () => {
  it('tallies paths, types and presence across docs', () => {
    const stats = new Map<string, FieldStats>();
    tallyDoc({ a: 1, m: { x: 'y' }, l: [{ k: true }] }, stats);
    tallyDoc({ a: null }, stats);
    expect(censusRows(stats, 2)).toEqual([
      { path: 'a', types: 'null|number', pct: 100, docCount: 2 },
      { path: 'l', types: 'array', pct: 50, docCount: 1 },
      { path: 'l[]', types: 'map', pct: 50, docCount: 1 },
      { path: 'l[].k', types: 'boolean', pct: 50, docCount: 1 },
      { path: 'm', types: 'map', pct: 50, docCount: 1 },
      { path: 'm.x', types: 'string', pct: 50, docCount: 1 },
    ]);
  });
});

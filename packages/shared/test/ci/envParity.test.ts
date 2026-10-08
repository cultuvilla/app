import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  BASELINE_PATH,
  type Baseline,
  DIMENSIONS,
  diffSnapshot,
  draftBaseline,
  expectedFor,
  exportedFunctionNames,
  indexKey,
  normalize,
  validateBaseline,
} from '../../../../scripts/check-env-parity.mjs';

// Dev and beta exist to prove prod will work; they only can while they are
// configured like prod. 2026-10-07 a Storage rule every deployed project
// refuses reached prod with every gate green. Every deploy and a nightly run
// now hold each env to one declared configuration.

const repoRoot = resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(resolve(repoRoot, p), 'utf-8');
const deploy = read('.github/workflows/deploy-firebase.yml');
const nightly = read('.github/workflows/env-parity.yml');
const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8')) as Baseline & { expected: { iam: string[] } };

const snap = () => ({
  firestore: { locationId: 'eu', pitr: 'ON' },
  bucket: { location: 'US' },
  auth: { email: true },
  apis: ['a.googleapis.com', 'b.googleapis.com'],
  iam: ['serviceAccount:x@<project>.iam.gserviceaccount.com roles/editor'],
  secrets: ['KEY'],
  authProviders: ['google.com'],
  authDomains: ['<project>.web.app'],
});

describe('the committed baseline', () => {
  it('is valid: every dimension, and every exception has a reason and does something', () => {
    expect(validateBaseline(baseline)).toEqual([]);
  });

  it('declares no project-specific value — envs compare through placeholders', () => {
    const text = JSON.stringify(baseline);
    for (const project of ['villa-events', 'cultuvilla-beta', 'cultuvilla-prod']) expect(text).not.toContain(project);
  });
});

describe('expectedFor / diffSnapshot', () => {
  const base = { expected: snap(), exceptions: {} as Record<string, unknown[]> };

  it('an env equal to the baseline has no differences', () => {
    expect(diffSnapshot(snap(), expectedFor(base, 'beta'))).toEqual([]);
  });

  it('reports every missing, unexpected and changed item', () => {
    const actual = { ...snap(), apis: ['b.googleapis.com', 'c.googleapis.com'], firestore: { locationId: 'us', pitr: 'ON' } };
    expect(diffSnapshot(actual, expectedFor(base, 'beta'))).toEqual([
      'apis: missing a.googleapis.com',
      'apis: unexpected c.googleapis.com',
      'firestore.locationId: is "us", expected "eu"',
    ]);
  });

  it('applies only the env own exceptions', () => {
    const withEx = {
      ...base,
      exceptions: {
        dev: [
          { dimension: 'apis', add: ['c.googleapis.com'], remove: ['a.googleapis.com'], reason: 'dev only, for a reason' },
          { dimension: 'firestore', set: { pitr: 'OFF' }, reason: 'backups cost money' },
        ],
      },
    };
    const dev = { ...snap(), apis: ['b.googleapis.com', 'c.googleapis.com'], firestore: { locationId: 'eu', pitr: 'OFF' } };
    expect(diffSnapshot(dev, expectedFor(withEx, 'dev'))).toEqual([]);
    expect(diffSnapshot(dev, expectedFor(withEx, 'beta'))).not.toEqual([]);
  });
});

describe('validateBaseline', () => {
  const ok = { expected: snap(), exceptions: {} };
  it('refuses an exception without a real reason', () => {
    const b = { ...ok, exceptions: { dev: [{ dimension: 'secrets', add: ['X'], reason: 'TODO' }] } };
    expect(validateBaseline(b)).toEqual(['exceptions.dev[0]: needs a real reason']);
  });
  it('refuses a no-op exception, which is a stale one', () => {
    const b = {
      ...ok,
      exceptions: {
        dev: [
          { dimension: 'secrets', add: ['KEY'], reason: 'already there, so stale' },
          { dimension: 'bucket', set: { location: 'US' }, reason: 'same as expected, so stale' },
        ],
      },
    };
    expect(validateBaseline(b)).toEqual([
      'exceptions.dev[0]: adds KEY, already expected',
      'exceptions.dev[1]: sets location to its expected value',
    ]);
  });
  it('refuses an unknown env or dimension', () => {
    const b = { ...ok, exceptions: { staging: [{ dimension: 'cdn', set: { a: 1 }, reason: 'there is no such thing' }] } };
    expect(validateBaseline(b)).toEqual(['exceptions.staging: unknown env', 'exceptions.staging[0]: unknown dimension "cdn"']);
  });
  it('requires every dimension in expected', () => {
    expect(validateBaseline({ expected: {}, exceptions: {} })).toHaveLength(DIMENSIONS.length);
  });
});

describe('draftBaseline', () => {
  it('takes prod as the reference and turns dev and beta differences into TODO exceptions', () => {
    const prod = snap();
    const dev = { ...snap(), secrets: ['KEY', 'DEV_ONLY'] };
    const draft = draftBaseline({ prod, beta: snap(), dev });
    expect(draft.expected).toEqual(prod);
    expect(draft.exceptions).toEqual({ dev: [{ dimension: 'secrets', add: ['DEV_ONLY'], reason: 'TODO' }] });
    expect(validateBaseline(draft)).toEqual(['exceptions.dev[0]: needs a real reason']);
  });
});

describe('normalize', () => {
  it('replaces the project id and number so envs compare', () => {
    expect(
      normalize(
        { iam: ['serviceAccount:123-compute@developer.gserviceaccount.com', 'serviceAccount:demo-prod@appspot.gserviceaccount.com'] },
        { project: 'demo-prod', number: 123 },
      ),
    ).toEqual({ iam: ['serviceAccount:<number>-compute@developer.gserviceaccount.com', 'serviceAccount:<project>@appspot.gserviceaccount.com'] });
  });
});

describe('artifacts', () => {
  it('reads the deployed function set from functions/src/index.ts', () => {
    const names = exportedFunctionNames(read('functions/src/index.ts'));
    expect(names.length).toBeGreaterThan(50);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('registerToEvent');
    expect(exportedFunctionNames('export {\n  a, // note\n  b as c,\n} from "./x";\nexport const d = 1;')).toEqual(['a', 'c', 'd']);
  });

  it('compares indexes without the implicit __name__ tiebreaker a deployed one carries', () => {
    const declared = { collectionGroup: 'events', queryScope: 'COLLECTION', fields: [{ fieldPath: 'status', order: 'ASCENDING' }] };
    const deployed = { ...declared, fields: [...declared.fields, { fieldPath: '__name__', order: 'ASCENDING' }] };
    expect(indexKey(deployed)).toBe(indexKey(declared));
    expect(indexKey({ ...declared, fields: [{ fieldPath: 'tags', arrayConfig: 'CONTAINS' }] })).toBe('events|COLLECTION|tags:CONTAINS');
  });
});

describe('workflow wiring', () => {
  const at = (needle: string) => {
    const i = deploy.indexOf(needle);
    expect(i, needle).toBeGreaterThan(-1);
    return i;
  };

  it('gates every deploy on config parity before anything deploys', () => {
    const gate = at('node scripts/check-env-parity.mjs --env=${{ inputs.firebase_alias }} --scope=config');
    expect(gate).toBeGreaterThan(at('google-github-actions/auth@v2'));
    expect(gate).toBeLessThan(at('Release plan — hold a breaking release'));
    expect(gate).toBeLessThan(at('Auto-apply opted-in backfills'));
    expect(gate).toBeLessThan(at('firebase deploy --only firestore:rules,storage'));
    const step = deploy.slice(deploy.lastIndexOf('- name:', gate), gate);
    expect(step).not.toMatch(/\bif:/);
  });

  it('checks what went live after deploying, except while a release holds its backend', () => {
    const check = at('node scripts/check-env-parity.mjs --env=${{ inputs.firebase_alias }} --scope=artifacts');
    expect(check).toBeGreaterThan(at('firebase deploy --only functions'));
    expect(check).toBeGreaterThan(at('firebase deploy --only hosting:app'));
    const step = deploy.slice(deploy.lastIndexOf('- name:', check), check);
    expect(step).toContain("if: ${{ steps.release.outputs.hold_backend != 'true' }}");
  });

  it('deploys indexes with --force, so firestore.indexes.json is the whole truth', () => {
    expect(deploy).toContain('firebase deploy --only firestore:indexes --project ${{ inputs.firebase_alias }} --non-interactive --force');
  });

  it('checks every env nightly, each from its own branch', () => {
    expect(nightly).toMatch(/schedule:\s*\n\s*- cron:/);
    expect(nightly).toContain('for ref in develop beta main');
    expect(nightly).toContain("environment: ${{ github.ref_name == 'main' && 'production' || github.ref_name == 'beta' && 'beta' || 'dev' }}");
    expect(nightly).toContain('node scripts/check-env-parity.mjs --env="${PARITY_ENV}" --scope=all');
  });

  it('grants the deploy identity the read-only roles the check needs', () => {
    const setup = read('scripts/setup-ci-deploy-wif.sh');
    for (const role of ['roles/iam.securityReviewer', 'roles/serviceusage.serviceUsageViewer']) {
      expect(setup).toContain(`  ${role}`);
      expect(baseline.expected.iam).toContain(`serviceAccount:gha-deployer@<project>.iam.gserviceaccount.com ${role}`);
    }
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  ENVS,
  findMissingMarkers,
  looksLikeBackfill,
  markerPath,
  selectAutoApplicable,
  selectPostDeploy,
  selectPreDeploy,
  topoSort,
  validateMeta,
} from '../lib/backfill-registry.mjs';

const base = {
  id: 'sample-backfill',
  kind: 'backfill',
  description: 'sample',
  phase: 'pre-deploy',
  envs: ['dev', 'beta', 'prod'],
  idempotent: true,
  owner: 'alvaro',
  autoApply: [],
};
const meta = (over = {}) => ({ ...base, ...over });
const invalid = (over, match) => assert.throws(() => validateMeta(meta(over)), match);

describe('markerPath', () => {
  it('produces an even-segment (document) path', () => {
    // Firestore: odd segments = collection, and `db.doc()` throws on one. This
    // is the trap that bit the Órdago registry three times.
    const segments = markerPath('some-id').split('/');
    assert.equal(segments.length % 2, 0);
    assert.equal(markerPath('some-id'), '_admin/backfills/markers/some-id');
  });
});

describe('validateMeta', () => {
  it('accepts a well-formed meta and returns it', () => {
    assert.deepEqual(validateMeta(meta()), meta());
  });

  it('accepts a missing autoApply as empty', () => {
    const { autoApply, ...withoutAutoApply } = base;
    assert.doesNotThrow(() => validateMeta(withoutAutoApply));
  });

  it('rejects a non-object', () => {
    for (const bad of [null, undefined, 'x', 42]) assert.throws(() => validateMeta(bad), /must be an object/);
  });

  it('rejects a non-kebab-case id', () => {
    for (const id of ['', 'Sample', 'sample_backfill', 'sample--backfill', '-sample', 'sample-']) {
      invalid({ id }, /kebab-case/);
    }
  });

  it('rejects an unknown kind, phase, or env', () => {
    invalid({ kind: 'repair' }, /kind/);
    invalid({ phase: 'later' }, /phase/);
    invalid({ envs: ['staging'] }, /envs/);
  });

  it('rejects an empty description, owner, or envs list', () => {
    invalid({ description: '' }, /description/);
    invalid({ owner: '' }, /owner/);
    invalid({ envs: [] }, /envs/);
  });

  it('rejects a non-boolean idempotent', () => {
    invalid({ idempotent: 'yes' }, /idempotent/);
  });

  it('rejects autoApply for an env the backfill does not target', () => {
    invalid({ envs: ['dev'], autoApply: ['prod'] }, /subset of envs/);
  });

  it('rejects autoApply on a non-idempotent backfill', () => {
    // The deploy runs these unattended; a retry must be a no-op.
    invalid({ idempotent: false, autoApply: ['dev'] }, /requires idempotent/);
  });

  it('rejects a gating audit', () => {
    // An audit writes no marker, so a gating phase could never be satisfied and
    // would block the deploy forever.
    invalid({ kind: 'audit', phase: 'pre-deploy' }, /audit/);
    invalid({ kind: 'audit', phase: 'post-deploy' }, /audit/);
    assert.doesNotThrow(() => validateMeta(meta({ kind: 'audit', phase: 'none' })));
  });

  it('accepts a missing dependsOn as empty', () => {
    const { autoApply, ...rest } = base;
    assert.doesNotThrow(() => validateMeta({ ...rest, autoApply }));
  });

  it('rejects a dependsOn that is not a list of ids', () => {
    invalid({ dependsOn: 'other' }, /array of backfill ids/);
    invalid({ dependsOn: [42] }, /array of backfill ids/);
    invalid({ dependsOn: [''] }, /array of backfill ids/);
  });

  it('rejects a self-dependency', () => {
    invalid({ dependsOn: ['sample-backfill'] }, /cannot depend on itself/);
  });
});

describe('topoSort', () => {
  const ordered = (list) => topoSort(list).map((m) => m.id);

  it('puts a dependency before its dependent', () => {
    // The projection case: `denorm` writes rows that `source` also writes, so
    // running it first would have its work clobbered by the live old trigger.
    const out = ordered([meta({ id: 'denorm', dependsOn: ['source'] }), meta({ id: 'source' })]);
    assert.deepEqual(out, ['source', 'denorm']);
  });

  it('is stable for independent backfills — ties keep incoming order', () => {
    // Otherwise renaming an unrelated backfill silently reshuffles the run.
    const out = ordered([meta({ id: 'c' }), meta({ id: 'a' }), meta({ id: 'b' })]);
    assert.deepEqual(out, ['c', 'a', 'b']);
  });

  it('resolves a transitive chain', () => {
    const out = ordered([
      meta({ id: 'third', dependsOn: ['second'] }),
      meta({ id: 'second', dependsOn: ['first'] }),
      meta({ id: 'first' }),
    ]);
    assert.deepEqual(out, ['first', 'second', 'third']);
  });

  it('ignores a dependency that is not in the selected set', () => {
    // A dep that is not opted in for this env simply imposes no ordering — it
    // must not drag an unselected backfill into the run.
    assert.deepEqual(ordered([meta({ id: 'only', dependsOn: ['absent'] })]), ['only']);
  });

  it('throws on a cycle rather than picking an arbitrary order', () => {
    assert.throws(
      () => topoSort([meta({ id: 'a', dependsOn: ['b'] }), meta({ id: 'b', dependsOn: ['a'] })]),
      /cycle/,
    );
  });
});

describe('selectors', () => {
  const registry = [
    meta({ id: 'pre-all', phase: 'pre-deploy' }),
    meta({ id: 'pre-dev-only', phase: 'pre-deploy', envs: ['dev'] }),
    meta({ id: 'post-all', phase: 'post-deploy' }),
    meta({ id: 'never', phase: 'none' }),
    meta({ id: 'an-audit', kind: 'audit', phase: 'none' }),
    meta({ id: 'auto-beta', phase: 'none', autoApply: ['beta'] }),
  ];
  const ids = (list) => list.map((m) => m.id).sort();

  it('selects pre-deploy backfills that target the env', () => {
    assert.deepEqual(ids(selectPreDeploy(registry, 'dev')), ['pre-all', 'pre-dev-only']);
    assert.deepEqual(ids(selectPreDeploy(registry, 'beta')), ['pre-all']);
  });

  it('selects post-deploy backfills separately from pre-deploy ones', () => {
    assert.deepEqual(ids(selectPostDeploy(registry, 'prod')), ['post-all']);
  });

  it('never selects an audit — it writes no marker', () => {
    for (const env of ENVS) {
      const selected = [...selectPreDeploy(registry, env), ...selectPostDeploy(registry, env), ...selectAutoApplicable(registry, env)];
      assert.equal(selected.some((m) => m.kind === 'audit'), false);
    }
  });

  it('returns auto-applicable backfills in dependency order', () => {
    const chained = [
      meta({ id: 'projection', phase: 'none', autoApply: ['beta'], dependsOn: ['source'] }),
      meta({ id: 'source', phase: 'none', autoApply: ['beta'] }),
    ];
    assert.deepEqual(
      selectAutoApplicable(chained, 'beta').map((m) => m.id),
      ['source', 'projection'],
    );
  });

  it('selects auto-applicable backfills only for their opted-in env', () => {
    assert.deepEqual(ids(selectAutoApplicable(registry, 'beta')), ['auto-beta']);
    assert.deepEqual(ids(selectAutoApplicable(registry, 'prod')), []);
    assert.deepEqual(ids(selectAutoApplicable(registry, 'dev')), []);
  });

  it('tolerates a null or empty registry', () => {
    for (const empty of [null, undefined, []]) {
      assert.deepEqual(selectPreDeploy(empty, 'dev'), []);
      assert.deepEqual(selectPostDeploy(empty, 'dev'), []);
      assert.deepEqual(selectAutoApplicable(empty, 'dev'), []);
    }
  });
});

describe('findMissingMarkers', () => {
  const markers = {
    'ran-everywhere': { dev: { actor: 'a' }, beta: { actor: 'a' } },
    'ran-dev-only': { dev: { actor: 'a' } },
  };
  const getMarker = async (id) => markers[id] ?? null;

  it('reports ids with no marker for the env', async () => {
    const metas = [meta({ id: 'ran-everywhere' }), meta({ id: 'ran-dev-only' }), meta({ id: 'never-ran' })];
    assert.deepEqual(await findMissingMarkers(metas, 'dev', getMarker), ['never-ran']);
    assert.deepEqual(await findMissingMarkers(metas, 'beta', getMarker), ['ran-dev-only', 'never-ran']);
  });

  it('treats a marker for a DIFFERENT env as missing', async () => {
    // Per-env markers are the whole point: applied to beta says nothing about prod.
    assert.deepEqual(await findMissingMarkers([meta({ id: 'ran-dev-only' })], 'prod', getMarker), ['ran-dev-only']);
  });

  it('returns nothing for an empty selection', async () => {
    assert.deepEqual(await findMissingMarkers([], 'dev', getMarker), []);
  });
});

describe('looksLikeBackfill', () => {
  it('reads a direct child of scripts/ as a backfill by its name', () => {
    assert.equal(looksLikeBackfill('scripts/backfill-x.mjs'), true);
    assert.equal(looksLikeBackfill('scripts/migrate-x.mjs'), true);
    assert.equal(looksLikeBackfill('scripts/seed-x.mjs'), false);
  });

  it('reads every script in scripts/backfill/ as a backfill, whatever its name', () => {
    assert.equal(looksLikeBackfill('scripts/backfill/delete-cover-images.mjs'), true);
    assert.equal(looksLikeBackfill('scripts/backfill/thing-b.mjs'), true);
  });

  it('never reads registry tooling or an unscanned path as a backfill', () => {
    assert.equal(looksLikeBackfill('scripts/lint-backfill-meta.mjs'), false);
    assert.equal(looksLikeBackfill('scripts/lib/backfill.mjs'), false);
  });
});

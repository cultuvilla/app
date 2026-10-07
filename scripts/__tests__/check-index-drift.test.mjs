import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { diffIndexes, indexKey } from '../check-index-drift.mjs';

const idx = (collectionGroup, fields, queryScope) => ({
  collectionGroup,
  ...(queryScope ? { queryScope } : {}),
  fields: fields.map(([fieldPath, order]) =>
    order === 'CONTAINS' ? { fieldPath, arrayConfig: 'CONTAINS' } : { fieldPath, order },
  ),
});

describe('diffIndexes', () => {
  const declared = [
    idx('events', [['municipalityId', 'ASCENDING'], ['startDate', 'ASCENDING']]),
    idx('persons', [['municipalityIds', 'CONTAINS'], ['name', 'ASCENDING']]),
  ];

  it('reports nothing when live matches the file', () => {
    assert.deepEqual(diffIndexes(declared, declared), { orphans: [], missing: [] });
  });

  it('ignores the __name__ field Firestore appends by itself', () => {
    const live = declared.map((i) => ({ ...i, fields: [...i.fields, { fieldPath: '__name__', order: 'ASCENDING' }] }));
    assert.deepEqual(diffIndexes(declared, live), { orphans: [], missing: [] });
  });

  it('treats an absent queryScope as COLLECTION', () => {
    const live = declared.map((i) => ({ ...i, queryScope: 'COLLECTION' }));
    assert.deepEqual(diffIndexes(declared, live), { orphans: [], missing: [] });
  });

  it('names a live index the file lacks as an orphan', () => {
    const orphan = idx('newsComments', [['postId', 'ASCENDING'], ['createdAt', 'ASCENDING']]);
    const { orphans, missing } = diffIndexes(declared, [...declared, orphan]);
    assert.deepEqual(orphans, [indexKey(orphan)]);
    assert.deepEqual(missing, []);
  });

  it('names a declared index that is not live as missing', () => {
    const { orphans, missing } = diffIndexes(declared, declared.slice(1));
    assert.deepEqual(orphans, []);
    assert.deepEqual(missing, [indexKey(declared[0])]);
  });

  it('tells apart a field order and a collection-group scope', () => {
    const desc = idx('events', [['municipalityId', 'ASCENDING'], ['startDate', 'DESCENDING']]);
    const group = idx('events', [['municipalityId', 'ASCENDING'], ['startDate', 'ASCENDING']], 'COLLECTION_GROUP');
    assert.equal(diffIndexes(declared, [...declared, desc, group]).orphans.length, 2);
  });
});

describe('deploy-firebase.yml', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/deploy-firebase.yml', import.meta.url), 'utf8');
  const report = workflow.indexOf('node scripts/check-index-drift.mjs');
  const deploy = workflow.indexOf('firebase deploy --only firestore:indexes');

  it('deploys indexes with --force, so the file is the only source of truth', () => {
    assert.ok(deploy > -1);
    assert.match(workflow.slice(deploy, workflow.indexOf('\n', deploy)), /--force/);
  });

  it('reports the drift --force will delete, before deploying', () => {
    assert.ok(report > -1 && report < deploy);
  });
});

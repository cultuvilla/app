import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCosaData, buildGroupTaskData } from '@cultuvilla/shared/models';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const source = (name) => readFileSync(new URL(`../seed/${name}`, import.meta.url), 'utf8');

function rulesKeyList(fn) {
  const body = rules.match(new RegExp(`function ${fn}\\(\\)\\s*\\{\\s*return \\[([^\\]]*)\\]`));
  assert.ok(body, `${fn}() not found in firestore.rules`);
  return [...body[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

// These rules accept only the keys they list, so a seeded doc with one more can
// never be edited by a client — not even to put yourself on a task.
describe('demo seeds', () => {
  it('build tasks with exactly the keys the task rules accept', () => {
    const data = buildGroupTaskData({ title: 'x', createdBy: 'u' });
    assert.deepEqual(Object.keys(data).sort(), rulesKeyList('groupTaskKeys'));
  });

  it('build cosas with exactly the keys the cosa rules accept', () => {
    const data = buildCosaData({
      municipalityId: 'm', orgId: 'o', audience: 'group', ownerUid: 'u', ownerName: 'U', kind: 'prestamo',
      title: 'x', category: 'herramientas', createdBy: 'u', createdByName: 'U',
    });
    assert.deepEqual(Object.keys(data).sort(), rulesKeyList('cosaKeys'));
  });

  for (const seed of ['group-demo.mjs', 'cosateca-demo.mjs']) {
    it(`${seed} adds no seed tag to the docs it writes`, () => {
      assert.doesNotMatch(source(seed), /seedBatch\s*:/);
    });
  }
});

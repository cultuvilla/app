import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGroupTaskData } from '@cultuvilla/shared/models';

const rules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
const seed = readFileSync(new URL('../seed/group-demo.mjs', import.meta.url), 'utf8');

function rulesKeyList(fn) {
  const body = rules.match(new RegExp(`function ${fn}\\(\\)\\s*\\{\\s*return \\[([^\\]]*)\\]`));
  assert.ok(body, `${fn}() not found in firestore.rules`);
  return [...body[1].matchAll(/'([^']+)'/g)].map((m) => m[1]).sort();
}

// The task rules accept only the keys they list, so a seeded task with one more
// can never be edited — not even to put yourself on it.
describe('group demo seed', () => {
  it('builds tasks with exactly the keys the rules accept', () => {
    const data = buildGroupTaskData({ title: 'x', createdBy: 'u' });
    assert.deepEqual(Object.keys(data).sort(), rulesKeyList('groupTaskKeys'));
  });

  it('adds no seed tag to the docs it writes', () => {
    assert.doesNotMatch(seed, /seedBatch\s*:/);
  });
});

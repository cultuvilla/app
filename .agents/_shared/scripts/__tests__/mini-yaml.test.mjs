// Tests for scripts/lib/mini-yaml.js, the YAML subset reader behind the workflow
// and Maestro checks. Two halves: it reads what workflows and flows are written
// in exactly as js-yaml would (it was checked against js-yaml over ~1,600 files
// on 2026-11-27, with no silent difference), and it THROWS on what it does not
// understand — a security gate built on it must fail closed, never skip.
//
// Run with: node --test scripts/__tests__/mini-yaml.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const { load, loadAll, YamlSubsetError } = createRequire(import.meta.url)('../lib/mini-yaml.js');

test('a workflow: mappings, compact sequences, literal block scalars, comments', () => {
  const doc = load(`name: CI # the gate
on:
  workflow_dispatch:
    inputs:
      id: { description: "backfill id", required: true, type: string }
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Summary
        env:
          ID: \${{ inputs.id }}
        run: |
          echo "id: $ID" # not a comment inside a block scalar

          echo done
      - run: echo one-liner
`);
  assert.equal(doc.on.workflow_dispatch.inputs.id.required, true);
  assert.deepEqual(doc.jobs.run.steps[0], { uses: 'actions/checkout@v4' });
  assert.equal(doc.jobs.run.steps[1].env.ID, '${{ inputs.id }}');
  assert.equal(doc.jobs.run.steps[1].run, 'echo "id: $ID" # not a comment inside a block scalar\n\necho done\n');
  assert.equal(doc.jobs.run.steps[2].run, 'echo one-liner');
});

test('chomping, folding and indentation indicators', () => {
  const doc = load(`keep: |+
  a

strip: |-
  a
folded: >
  one
  two

  three
indented: |2
    deeper
plain: a
  b
`);
  assert.equal(doc.keep, 'a\n\n');
  assert.equal(doc.strip, 'a');
  assert.equal(doc.folded, 'one two\nthree\n');
  assert.equal(doc.indented, '  deeper\n');
  assert.equal(doc.plain, 'a b');
});

test('a sequence may sit at its key\'s own indentation', () => {
  assert.deepEqual(load('steps:\n- a\n- b\nnext: 1\n'), { steps: ['a', 'b'], next: 1 });
});

test('quoted scalars: escapes, doubled single quotes, folded line breaks', () => {
  const doc = load(`a: "x\\ny\\t\\"z\\""
b: 'it''s # not a comment'
c: "one
  two"
`);
  assert.equal(doc.a, 'x\ny\t"z"');
  assert.equal(doc.b, "it's # not a comment");
  assert.equal(doc.c, 'one two');
});

test('flow collections, across lines and nested — a Maestro flow', () => {
  const docs = loadAll(`appId: \${APP_ID}
---
- tapOn: { id: "card-a", index: 0 }
- scrollUntilVisible:
    element: { id: card-b }
    centerElement: true
- assertVisible: [ "a",
    b ]
`);
  assert.equal(docs.length, 2);
  assert.deepEqual(docs[1][0], { tapOn: { id: 'card-a', index: 0 } });
  assert.deepEqual(docs[1][1].scrollUntilVisible.element, { id: 'card-b' });
  assert.deepEqual(docs[1][2].assertVisible, ['a', 'b']);
});

test('core-schema scalars; `on` stays a string', () => {
  assert.deepEqual(load('on: push\nn: ~\nt: true\ni: 12\nf: 1.5\ns: 1.2.3\n'), { on: 'push', n: null, t: true, i: 12, f: 1.5, s: '1.2.3' });
});

// The fail-closed half. Each of these is valid YAML that js-yaml reads; a check
// that silently mis-read one could pass the very file holding the problem.
for (const [construct, source] of [
  ['an anchor', 'a: &x 1\n'],
  ['an alias', 'a: 1\nb: *x\n'],
  ['an anchored mapping', 'base: &b\n  run: x\n'],
  ['an alias inside a flow mapping', 'a: { b: *x }\n'],
  ['a tag', 'a: !!str 1\n'],
  ['a merge key', 'a:\n  <<: { b: 1 }\n'],
  ['an explicit key', 'a:\n  ? b\n  : c\n'],
  ['tabs as indentation', 'a:\n\tb: 1\n'],
  ['an unterminated flow collection', 'a: { b: 1\n'],
  ['an unterminated quoted scalar', 'a: "b\n'],
  ['a malformed block scalar header', 'a: |x\n  b\n'],
  ['an escaped line break', 'a: "b\\\n  c"\n'],
  ['a mis-indented line', 'a:\n    b: 1\n  c: 2\n'],
]) {
  test(`fails closed on ${construct}, naming the line`, () => {
    assert.throws(() => loadAll(source), (err) => err instanceof YamlSubsetError && /line \d+|escape/.test(err.message));
  });
}

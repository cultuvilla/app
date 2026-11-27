import { before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadUidCascade } from '../lib/uid-cascade.mjs';
import {
  COMPANION_ANCHORS,
  EXPORTED_ACTIONS,
  STORAGE_ENTRIES,
  assertUid,
  collectUserData,
  matchesTemplate,
  planExport,
  readOnlyFirestore,
} from '../lib/user-data-export.mjs';
import { parseArgs } from '../admin-export-user.mjs';

const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));
const UID = 'user-1';

/** The real registry, bundled the way the script loads it (needs `pnpm shared:build`). */
let cascade;
let plan;
before(async () => {
  cascade = await loadUidCascade();
  plan = planExport(cascade.UID_CASCADE, cascade.COLLECTIONS);
});

describe('the export covers the deletion registry', () => {
  it('accounts for every UID_CASCADE entry: read, or listed as retained with its reason', () => {
    const planned = new Set([...plan.entries.map((e) => e.id), ...plan.retained.map((e) => e.id)]);
    assert.deepEqual(cascade.UID_CASCADE.map((e) => e.id).filter((id) => !planned.has(id)), []);
    for (const entry of plan.retained) assert.ok(entry.reason.trim(), `${entry.id} has no reason`);
  });

  it('reads every target of every exported entry', () => {
    const exported = cascade.UID_CASCADE.filter((e) => EXPORTED_ACTIONS.has(e.action));
    for (const entry of exported) {
      const planned = plan.entries.find((e) => e.id === entry.id);
      assert.deepEqual(planned.targets.map((t) => t.collection), entry.targets.map((t) => t.collection), entry.id);
      for (const target of planned.targets) assert.ok(target.reads.length > 0, `${entry.id}: ${target.collection}`);
    }
  });

  it('skips a field only when the same target is found by another', () => {
    for (const entry of plan.entries) {
      for (const target of entry.targets) {
        for (const skip of target.skipped) {
          assert.equal(skip.field, 'id', `${entry.id}: ${target.collection}.${skip.field} is unreachable`);
          assert.ok(target.reads.some((r) => r.kind === 'query'), `${entry.id}: ${target.collection}`);
        }
      }
    }
  });

  it('has a storage prefix for every entry with no collection, and no stale one', () => {
    const targetless = plan.entries.filter((e) => e.storage).map((e) => e.id);
    assert.deepEqual(targetless.sort(), Object.keys(STORAGE_ENTRIES).sort());
  });

  it('keeps COMPANION_ANCHORS to companions the registry still has', () => {
    const companions = cascade.UID_CASCADE.flatMap((e) => e.targets.filter((t) => t.fields.length === 0).map((t) => t.collection));
    for (const key of Object.keys(COMPANION_ANCHORS)) assert.ok(companions.includes(key), key);
  });

  it('queries a list field with array-contains and a nested field by its dotted path', () => {
    const reads = plan.entries.flatMap((e) => e.targets.flatMap((t) => t.reads.map((r) => ({ c: t.collection, ...r }))));
    assert.equal(reads.find((r) => r.c === 'events' && r.field === 'organizerUserIds').op, 'array-contains');
    assert.equal(reads.find((r) => r.c === 'events' && r.field === 'createdBy').op, '==');
    assert.ok(reads.some((r) => r.c === 'cosas' && r.field === 'heldBy.uid' && r.op === '=='));
  });
});

/** An in-memory store behind the reader interface; every call is a read by construction. */
function fakeReader(docs, files = []) {
  const all = Object.entries(docs).map(([p, data]) => ({ path: p, data }));
  const valueAt = (data, field) => field.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), data);
  return {
    async getDoc(p) {
      return all.find((d) => d.path === p) ?? null;
    },
    async listCollection(p) {
      return all.filter((d) => d.path.startsWith(`${p}/`) && d.path.split('/').length === p.split('/').length + 1);
    },
    async query({ collectionId, group, field, op, value }) {
      return all.filter((d) => {
        const segs = d.path.split('/');
        if (segs.at(-2) !== collectionId || (!group && segs.length !== 2)) return false;
        const v = valueAt(d.data, field);
        return op === 'array-contains' ? Array.isArray(v) && v.includes(value) : v === value;
      });
    },
    async listFiles(prefix) {
      return files.filter((f) => f.startsWith(prefix)).map((f) => `gs://b/${f}`);
    },
  };
}

describe('collectUserData', () => {
  it("bundles the user's documents, companions and files — nobody else's", async () => {
    const when = new Date('2026-01-02T03:04:05Z');
    const reader = fakeReader(
      {
        [`users/${UID}`]: { displayName: 'Ana', createdAt: { toDate: () => when } },
        'users/other': { displayName: 'Bea' },
        [`users/${UID}/devices/d1`]: { token: 't' },
        'events/e1': { createdBy: UID, title: 'Mine' },
        'events/e2': { createdBy: 'other', organizerUserIds: [UID] },
        'events/e3': { createdBy: 'other', organizerUserIds: ['other'] },
        'events/e1/registrations/r1': { userId: UID },
        'events/e1/registrationPrivate/r1': { phone: '600' },
        'events/e1/registrationPrivate/r2': { phone: '700' },
        'municipalities/m1/members/x': { userId: UID },
        'organizations/o1/members/x': { userId: UID },
        'organizations/o1/socios/s1': { uid: UID },
        'organizations/o1/socioPrivate/s1': { phone: '611' },
        'organizations/o1/socioPrivate/s2': { phone: '622' },
        'organizations/o1/chat/c1': { authorUid: UID },
        'organizations/o1/messages/m/chat/c2': { authorUid: 'other', replyTo: { authorUid: UID } },
        'cosas/k1': { ownerUid: UID },
        'cosas/k1/slots/s': { requestId: 'q' },
        'membershipEvents/a1': { actorUserId: UID },
      },
      [`users/${UID}/photo/a.jpg`, 'users/other/photo/b.jpg'],
    );

    const bundle = await collectUserData(UID, plan, reader);
    const paths = (id) => bundle.entries.find((e) => e.id === id).documents.map((d) => d.path);

    assert.deepEqual(paths('user-doc'), [`users/${UID}`]);
    assert.equal(bundle.entries.find((e) => e.id === 'user-doc').documents[0].data.createdAt, '2026-01-02T03:04:05.000Z');
    assert.deepEqual(paths('push-data'), [`users/${UID}/devices/d1`]);
    assert.deepEqual(paths('events'), ['events/e1', 'events/e2']);
    assert.deepEqual(paths('registrations'), ['events/e1/registrationPrivate/r1', 'events/e1/registrations/r1']);
    assert.deepEqual(paths('memberships'), ['municipalities/m1/members/x', 'organizations/o1/members/x']);
    assert.deepEqual(paths('socio-contacts'), ['organizations/o1/socioPrivate/s1']);
    assert.deepEqual(paths('chat-messages'), ['organizations/o1/chat/c1', 'organizations/o1/messages/m/chat/c2']);
    assert.deepEqual(paths('cosateca'), ['cosas/k1', 'cosas/k1/slots/s']);
    assert.deepEqual(bundle.storageObjects, [`gs://b/users/${UID}/photo/a.jpg`]);

    const reply = bundle.entries.find((e) => e.id === 'chat-messages').documents.find((d) => d.path.endsWith('c2'));
    assert.deepEqual(reply.matchedOn, ['organizationAvisoChat.replyTo.authorUid']);

    // Retained records are named with their reason, never read.
    assert.ok(bundle.retained.some((e) => e.id === 'audit-logs' && e.reason));
    assert.ok(!JSON.stringify(bundle.entries).includes('membershipEvents/'));
  });
});

describe('read-only', () => {
  it('refuses every bulk write on the Firestore handle', () => {
    const db = readOnlyFirestore({ batch() {}, bulkWriter() {}, runTransaction() {}, recursiveDelete() {}, doc: () => 'ref' });
    for (const method of ['batch', 'bulkWriter', 'runTransaction', 'recursiveDelete']) {
      assert.throws(() => db[method](), /reads only/);
    }
    assert.equal(db.doc('x'), 'ref');
  });

  it('never calls a document write in the script or its library', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['scripts/admin-export-user.mjs', 'scripts/lib/user-data-export.mjs']) {
      const source = readFileSync(path.join(REPO_ROOT, file), 'utf8');
      assert.doesNotMatch(source, /\.(update|delete|create|deleteFiles|save|batch|bulkWriter|runTransaction|recursiveDelete)\(/, file);
    }
  });
});

describe('parseArgs', () => {
  it('takes a uid and an env, and writes outside the repo by default', () => {
    const args = parseArgs(['--uid=abc_1', '--env=dev']);
    assert.equal(args.uid, 'abc_1');
    assert.ok(args.outDir.startsWith(os.tmpdir()));
  });

  it('refuses an output directory inside the repo', () => {
    assert.throws(() => parseArgs(['--uid=a', '--env=dev', `--out-dir=${path.join(REPO_ROOT, 'exports')}`]), /inside the repo/);
  });

  it('refuses an unknown flag, an unknown env and a uid that could leave the directory', () => {
    assert.throws(() => parseArgs(['--uid=a', '--env=dev', '--apply']), /Unknown argument/);
    assert.throws(() => parseArgs(['--uid=a', '--env=staging']), /dev, beta or prod/);
    assert.throws(() => assertUid('../etc'), /Not a uid/);
  });

  it('matches a document to its own collection template only', () => {
    assert.ok(matchesTemplate('organizations/o/chat/c', 'organizations/{organizationId}/chat'));
    assert.ok(!matchesTemplate('cosaRequests/r/chat/c', 'organizations/{organizationId}/chat'));
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deleteRevision, plan, protectedRevisions, run } from '../cleanup-cloudrun-revisions.mjs';

// The one promise this script makes is that it never deletes a revision a
// service still needs. Each guard is pinned on its own, and end to end.

const NOW = Date.parse('2026-11-27T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86_400_000).toISOString();
const SVC = 'projects/p/locations/us-central1/services/fn';
const rev = (n, age) => ({ name: `${SVC}/revisions/fn-${String(n).padStart(5, '0')}`, createTime: daysAgo(age) });
const service = (over = {}) => ({
  name: SVC,
  traffic: [{ type: 'TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST', percent: 100 }],
  trafficStatuses: [{ revision: 'fn-00010', percent: 100 }],
  latestReadyRevision: `${SVC}/revisions/fn-00010`,
  latestCreatedRevision: `${SVC}/revisions/fn-00010`,
  ...over,
});
// fn-00001 … fn-00010, the oldest 30 days old, one day apart.
const revisions = Array.from({ length: 10 }, (_, i) => rev(i + 1, 30 - i * 3));
const names = (list) => list.map((r) => r.name.split('/').pop());

describe('protectedRevisions', () => {
  it('names every revision traffic, traffic status or the latest pointers mention', () => {
    const s = service({
      traffic: [{ revision: 'fn-00003', percent: 0, tag: 'canary' }],
      trafficStatuses: [{ revision: 'fn-00004', percent: 100 }],
      latestReadyRevision: `${SVC}/revisions/fn-00005`,
      latestCreatedRevision: `${SVC}/revisions/fn-00006`,
    });
    assert.deepEqual([...protectedRevisions(s)].sort(), ['fn-00003', 'fn-00004', 'fn-00005', 'fn-00006']);
  });
});

describe('plan', () => {
  it('deletes only old revisions outside the serving set and the newest --keep', () => {
    const { deletable, kept } = plan(service(), revisions, { now: NOW, keep: 2, minAgeDays: 2 });
    assert.deepEqual(names(deletable), ['fn-00008', 'fn-00007', 'fn-00006', 'fn-00005', 'fn-00004', 'fn-00003', 'fn-00002', 'fn-00001']);
    assert.deepEqual(kept, { protected: 1, recent: 1, young: 0, reconciling: 0 });
  });

  it('keeps a serving revision that is older than a failed newer deploy', () => {
    const s = service({
      trafficStatuses: [{ revision: 'fn-00002', percent: 100 }],
      latestReadyRevision: `${SVC}/revisions/fn-00002`,
      latestCreatedRevision: `${SVC}/revisions/fn-00010`,
    });
    const { deletable } = plan(s, revisions, { now: NOW, keep: 0, minAgeDays: 0 });
    assert.ok(!names(deletable).includes('fn-00002'));
    assert.ok(!names(deletable).includes('fn-00010'));
    assert.equal(deletable.length, 8);
  });

  it('keeps revisions younger than --min-age-days', () => {
    const young = [rev(1, 30), rev(2, 1), rev(3, 0.5), rev(4, 0)];
    const s = service({ trafficStatuses: [], latestReadyRevision: undefined, latestCreatedRevision: undefined });
    const { deletable, kept } = plan(s, young, { now: NOW, keep: 0, minAgeDays: 2 });
    assert.deepEqual(names(deletable), ['fn-00001']);
    assert.equal(kept.young, 3);
  });

  it('keeps a revision with an unreadable creation time', () => {
    const s = service({ trafficStatuses: [], latestReadyRevision: undefined, latestCreatedRevision: undefined });
    const { deletable } = plan(s, [{ name: `${SVC}/revisions/fn-00001` }], { now: NOW, keep: 0, minAgeDays: 0 });
    assert.deepEqual(deletable, []);
  });

  it('leaves a reconciling service alone entirely', () => {
    const { deletable, kept } = plan(service({ reconciling: true }), revisions, { now: NOW });
    assert.deepEqual(deletable, []);
    assert.equal(kept.reconciling, 10);
  });
});

class HttpError extends Error {
  constructor(status) {
    super(`HTTP ${status}`);
    this.status = status;
  }
}

describe('deleteRevision', () => {
  it('retries a rate limit, then succeeds', async () => {
    let calls = 0;
    const api = async () => {
      calls += 1;
      if (calls < 3) throw new HttpError(429);
      return {};
    };
    await deleteRevision(api, 'x', { backoff: async () => {} });
    assert.equal(calls, 3);
  });

  it('treats 404 as already gone and gives up on a 403', async () => {
    await deleteRevision(async () => { throw new HttpError(404); }, 'x', { backoff: async () => {} });
    await assert.rejects(deleteRevision(async () => { throw new HttpError(403); }, 'x', { backoff: async () => {} }), /403/);
  });
});

describe('run', () => {
  const fakeApi = () => {
    const deleted = [];
    const api = async (url, init) => {
      if (init?.method === 'DELETE') {
        deleted.push(url.split('/').pop());
        return {};
      }
      if (url.includes('/locations/-/services')) return { services: [service()] };
      if (url.includes('/locations/us-central1/services/-/revisions')) {
        return url.includes('pageToken=p2')
          ? { revisions: revisions.slice(5) }
          : { revisions: revisions.slice(0, 5), nextPageToken: 'p2' };
      }
      throw new Error(`unrouted ${url}`);
    };
    return Object.assign(api, { deleted });
  };

  it('a dry run counts and deletes nothing', async () => {
    const api = fakeApi();
    const counts = await run({ api, project: 'p', apply: false, now: NOW, log: () => {} });
    assert.equal(counts.revisions, 10);
    assert.equal(counts.deletable, 8);
    assert.deepEqual(api.deleted, []);
  });

  it('applies oldest first, within --max-deletes, never the serving revision', async () => {
    const api = fakeApi();
    const counts = await run({
      api, project: 'p', apply: true, now: NOW, log: () => {}, pause: async () => {},
      options: { maxDeletes: 3, maxMinutes: 60 },
    });
    assert.deepEqual(api.deleted, ['fn-00001', 'fn-00002', 'fn-00003']);
    assert.equal(counts.deleted, 3);
  });
});

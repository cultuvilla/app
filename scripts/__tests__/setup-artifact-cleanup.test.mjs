import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_POLICY, FIREBASE_POLICY, cleanupLines, planFor, run } from '../setup-artifact-cleanup.mjs';

// `cleanupPolicies` is replaced, not merged, on write: the script must never
// write over a policy that exists — Firebase's own one on gcf-artifacts above all.

const repo = (location, name, cleanupPolicies) => ({
  name: `projects/p/locations/${location}/repositories/${name}`,
  ...(cleanupPolicies && { cleanupPolicies }),
});

describe('planFor', () => {
  it('keeps any existing policy', () => {
    assert.deepEqual(planFor(repo('us-east1', 'gcf-artifacts', FIREBASE_POLICY)), { action: 'keep' });
    assert.deepEqual(planFor(repo('us-east1', 'web', { mine: { id: 'mine', action: 'KEEP' } })), { action: 'keep' });
  });

  it("gives gcf-artifacts Firebase's own policy and any other repository the default", () => {
    assert.deepEqual(planFor(repo('us-east1', 'gcf-artifacts')), { action: 'set', policies: FIREBASE_POLICY });
    assert.deepEqual(planFor(repo('us-east1', 'cloud-run-source-deploy', {})), { action: 'set', policies: DEFAULT_POLICY });
  });

  it('the default keeps recent versions — Keep beats Delete', () => {
    assert.ok(Object.values(DEFAULT_POLICY).some((p) => p.action === 'KEEP' && p.mostRecentVersions.keepCount > 0));
    for (const p of Object.values(DEFAULT_POLICY).filter((x) => x.action === 'DELETE')) {
      assert.equal(p.condition.tagState, 'UNTAGGED');
    }
  });
});

describe('cleanupLines', () => {
  it('one line per policy, or none', () => {
    assert.deepEqual(cleanupLines(repo('us-east1', 'gcf-artifacts', FIREBASE_POLICY)), [
      'us-east1/gcf-artifacts firebase-functions-cleanup DELETE tagState=ANY,olderThan=86400s',
    ]);
    assert.deepEqual(cleanupLines({ ...repo('eu', 'x', DEFAULT_POLICY), cleanupPolicyDryRun: true }), [
      'eu/x delete-stale-untagged DELETE tagState=UNTAGGED,olderThan=604800s (dry-run)',
      'eu/x keep-recent-releases KEEP keepCount=5 (dry-run)',
    ]);
    assert.deepEqual(cleanupLines(repo('eu', 'x')), ['eu/x none']);
  });
});

describe('run', () => {
  const fakeApi = (repos) => {
    const writes = [];
    const api = async (url, init) => {
      if (init?.method === 'PATCH') {
        writes.push({ url, body: JSON.parse(init.body) });
        return {};
      }
      if (url.endsWith('/locations?pageSize=200')) return { locations: [{ locationId: 'us-east1' }, { locationId: 'eu' }] };
      const list = url.match(/locations\/([^/]+)\/repositories\?/);
      if (list) return { repositories: repos.filter((r) => r.name.includes(`/locations/${list[1]}/`)).map((r) => ({ name: r.name })) };
      const one = repos.find((r) => url.endsWith(r.name));
      if (one) return one;
      throw new Error(`unrouted ${url}`);
    };
    return Object.assign(api, { writes });
  };
  const repos = [repo('us-east1', 'gcf-artifacts', FIREBASE_POLICY), repo('eu', 'cloud-run-source-deploy')];

  it('a dry run writes nothing', async () => {
    const api = fakeApi(repos);
    assert.deepEqual(await run({ api, project: 'p', apply: false, log: () => {} }), { repositories: 2, kept: 1, set: 1 });
    assert.deepEqual(api.writes, []);
  });

  it('applies only to the repository without a policy', async () => {
    const api = fakeApi(repos);
    await run({ api, project: 'p', apply: true, log: () => {} });
    assert.equal(api.writes.length, 1);
    assert.match(api.writes[0].url, /eu\/repositories\/cloud-run-source-deploy\?updateMask=cleanupPolicies,cleanupPolicyDryRun$/);
    assert.deepEqual(api.writes[0].body, { cleanupPolicies: DEFAULT_POLICY, cleanupPolicyDryRun: false });
  });
});

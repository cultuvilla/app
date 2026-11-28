import { describe, it, expect, vi, afterAll } from 'vitest';

// The salt is read from the env (the deployed secret binds it there) and cached
// on first use, so it is set before the module under test loads.
vi.hoisted(() => {
  process.env.OBSERVABILITY_USER_ID_SALT = 'test-salt';
});

import { createHmac } from 'node:crypto';
import { getUserIdHash } from '../observability/getUserIdHash';
import { runCallable } from './helpers/functionsTest';

const run = (req: { auth?: { uid: string } }) => runCallable(getUserIdHash, { data: undefined, ...req });

afterAll(() => {
  delete process.env.OBSERVABILITY_USER_ID_SALT;
});

describe('getUserIdHash', () => {
  it('rejects an unauthenticated caller', async () => {
    await expect(run({})).rejects.toMatchObject({ code: 'unauthenticated' });
  });

  it('returns the salted HMAC of the caller’s own uid, never the raw uid', async () => {
    const { hash } = await run({ auth: { uid: 'user-123' } });
    expect(hash).toBe(createHmac('sha256', 'test-salt').update('user-123').digest('hex'));
    expect(hash).not.toContain('user-123');
  });

  it('is stable per uid and distinct across uids', async () => {
    const a = (await run({ auth: { uid: 'user-a' } })).hash;
    expect((await run({ auth: { uid: 'user-a' } })).hash).toBe(a);
    expect((await run({ auth: { uid: 'user-b' } })).hash).not.toBe(a);
  });
});

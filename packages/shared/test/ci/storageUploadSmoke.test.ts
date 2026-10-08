import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SMOKE_UID,
  failureMessage,
  provisionSmokeUser,
  runSmoke,
  smokePaths,
  upload,
  uploadUrl,
  type SmokeAuth,
} from '../../../../scripts/smoke-storage-upload.mjs';

// 2026-10-07: storage.rules gated image writes on cross-service
// firestore.exists(), which the emulator allows and every deployed project
// denies. The rules suite passed and every event cover in prod failed. Every
// deploy now uploads to each image path as a real signed-in user.

const repoRoot = resolve(__dirname, '../../../..');
const deploy = readFileSync(resolve(repoRoot, '.github/workflows/deploy-firebase.yml'), 'utf-8');
const imageService = readFileSync(
  resolve(repoRoot, 'packages/shared/src/services/imageService.ts'),
  'utf-8',
);

describe('storage upload smoke check', () => {
  const run = 'node scripts/smoke-storage-upload.mjs --env=${{ inputs.firebase_alias }}';

  it('runs on every dev and beta deploy, after the rules have had the slow deploys to propagate', () => {
    const smoke = deploy.indexOf(run);
    expect(smoke).toBeGreaterThan(deploy.indexOf('firebase deploy --only firestore:rules,storage'));
    expect(smoke).toBeGreaterThan(deploy.indexOf('firebase deploy --only functions'));
    expect(smoke).toBeGreaterThan(deploy.indexOf('firebase deploy --only hosting:app'));
    const step = deploy.slice(deploy.lastIndexOf('- name:', smoke), smoke);
    // Gated only by env — never by the backend hold, which a beta deploy never sets.
    expect(step).toContain("if: ${{ inputs.firebase_alias != 'prod' }}");
    expect(step).toContain('FIREBASE_WEB_API_KEY: ${{ vars.FIREBASE_API_KEY }}');
  });

  it('uploads to every path imageService writes to', () => {
    // Every upload path template in imageService, e.g.
    // `news/${postId}/images/${generateImageId(image.filename)}` -> ^news/[^/]+/images/[^/]+$
    const templates = [...imageService.matchAll(/(?:uploadToPath|uploadReturningPath)\(\s*`([^`]+)`/g)].map(
      (m) => m[1],
    );
    expect(templates.length).toBeGreaterThanOrEqual(9);
    const paths = smokePaths('m1');
    for (const template of templates) {
      const pattern = new RegExp(
        '^' + template.split(/\$\{[^}]*\}/).map((part) => part.replace(/[.*+?^()|[\]\\]/g, '\\$&')).join('[^/]+') + '$',
      );
      expect(paths.some((p) => pattern.test(p)), `no smoke upload covers ${template}`).toBe(true);
    }
  });

  it('uploads its own photo as the smoke user', () => {
    expect(smokePaths('m1')).toContain(`users/${SMOKE_UID}/photo/__ci-smoke__.png`);
  });

  it('encodes the object name into a single query parameter', () => {
    expect(uploadUrl('b.firebasestorage.app', 'news/x/images/y.png')).toBe(
      'https://firebasestorage.googleapis.com/v0/b/b.firebasestorage.app/o?uploadType=media&name=news%2Fx%2Fimages%2Fy.png',
    );
  });
});

describe('upload retries', () => {
  const sleepImpl = vi.fn(() => Promise.resolve());
  type Fetch = (url: string, init: RequestInit) => Promise<{ ok: boolean; status: number }>;
  const respond = (...statuses: (number | Error)[]) => {
    const fetchImpl = vi.fn<Fetch>();
    for (const s of statuses) {
      if (s instanceof Error) fetchImpl.mockRejectedValueOnce(s);
      else fetchImpl.mockResolvedValueOnce({ ok: s >= 200 && s < 300, status: s });
    }
    return fetchImpl;
  };
  const opts = (fetchImpl: ReturnType<typeof respond>) => ({ attempts: 3, delayMs: 1, fetchImpl, sleepImpl });

  it('passes on the first success', async () => {
    const fetchImpl = respond(200);
    expect(await upload('b', 'p', 't', opts(fetchImpl))).toEqual({ path: 'p', ok: true, status: 'HTTP 200' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('retries a 403 — the previous ruleset may still be served', async () => {
    const fetchImpl = respond(403, 200);
    expect((await upload('b', 'p', 't', opts(fetchImpl))).ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('retries a 5xx and a network error', async () => {
    const fetchImpl = respond(503, new Error('socket hang up'), 200);
    expect((await upload('b', 'p', 't', opts(fetchImpl))).ok).toBe(true);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('fails at once on a status a retry cannot fix', async () => {
    const fetchImpl = respond(400);
    expect(await upload('b', 'p', 't', opts(fetchImpl))).toEqual({ path: 'p', ok: false, status: 'HTTP 400' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('fails with the last status once the attempts run out', async () => {
    const fetchImpl = respond(403, 403, 403);
    expect(await upload('b', 'p', 't', opts(fetchImpl))).toEqual({ path: 'p', ok: false, status: 'HTTP 403' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('sends the image as the signed-in user', async () => {
    const fetchImpl = respond(200);
    await upload('b', 'news/x/images/y.png', 'tok', opts(fetchImpl));
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(uploadUrl('b', 'news/x/images/y.png'));
    expect(init.headers).toEqual({ Authorization: 'Firebase tok', 'Content-Type': 'image/png' });
  });
});

describe('smoke verdict', () => {
  it('uploads every path and fails the deploy when any is refused', async () => {
    const uploadImpl = vi.fn((_b: string, path: string) =>
      Promise.resolve({ path, ok: path !== 'p2', status: path === 'p2' ? 'HTTP 403' : 'HTTP 200' }),
    );
    const results = await runSmoke({ bucket: 'b', paths: ['p1', 'p2', 'p3'], token: 't', uploadImpl });
    expect(uploadImpl).toHaveBeenCalledTimes(3);
    expect(failureMessage('beta', results)).toMatch(/refuses 1 upload path\(s\) on beta/);
  });

  it('passes only when every upload passed, and never on an empty run', () => {
    expect(failureMessage('dev', [{ path: 'p', ok: true, status: 'HTTP 200' }])).toBeNull();
    expect(failureMessage('dev', [])).toMatch(/uploaded nothing/);
  });
});

describe('smoke account', () => {
  function fakeAuth(exists: boolean) {
    const notFound = Object.assign(new Error('no user'), { code: 'auth/user-not-found' });
    return {
      updateUser: vi.fn<SmokeAuth['updateUser']>(() =>
        exists ? Promise.resolve({}) : Promise.reject(notFound),
      ),
      createUser: vi.fn<SmokeAuth['createUser']>(() => Promise.resolve({})),
      setCustomUserClaims: vi.fn<SmokeAuth['setCustomUserClaims']>(() => Promise.resolve()),
    };
  }

  it('resets an existing account: new password, enabled, and no claims', async () => {
    const auth = fakeAuth(true);
    await expect(provisionSmokeUser(auth, 'pw')).resolves.toBe('pw');
    expect(auth.updateUser).toHaveBeenCalledWith(SMOKE_UID, { password: 'pw', disabled: false });
    expect(auth.createUser).not.toHaveBeenCalled();
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith(SMOKE_UID, null);
  });

  it('creates the account when it does not exist, and still clears claims', async () => {
    const auth = fakeAuth(false);
    await provisionSmokeUser(auth, 'pw');
    expect(auth.createUser).toHaveBeenCalledWith(expect.objectContaining({ uid: SMOKE_UID, password: 'pw' }));
    expect(auth.setCustomUserClaims).toHaveBeenCalledWith(SMOKE_UID, null);
  });

  it('fails on any other Auth error instead of creating a second account', async () => {
    const auth = fakeAuth(true);
    auth.updateUser.mockRejectedValueOnce(Object.assign(new Error('quota'), { code: 'auth/quota-exceeded' }));
    await expect(provisionSmokeUser(auth, 'pw')).rejects.toThrow('quota');
    expect(auth.createUser).not.toHaveBeenCalled();
  });

  it('fails when the claims cannot be cleared, so a privileged account never runs the smoke', async () => {
    const auth = fakeAuth(true);
    auth.setCustomUserClaims.mockRejectedValueOnce(new Error('claims refused'));
    await expect(provisionSmokeUser(auth, 'pw')).rejects.toThrow('claims refused');
  });

  it('generates a fresh password when none is given', async () => {
    const a = await provisionSmokeUser(fakeAuth(true));
    const b = await provisionSmokeUser(fakeAuth(true));
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(24);
  });
});

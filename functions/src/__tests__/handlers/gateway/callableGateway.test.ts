// The whole stack a client hits: the gateway handler over HTTP, with a real ID
// token from the Auth emulator. Each route is the callable's own `onCall`
// handler, so this proves the protocol survives being mounted behind the router.
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { createHmac } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.OBSERVABILITY_USER_ID_SALT = 'test-salt';
});

import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import type { Request } from 'firebase-functions/v2/https';

import { callableGateway } from '../../../gateway/callableGateway';

const UID = 'callable-gateway-user';

async function idTokenFor(uid: string): Promise<string> {
  const customToken = await getAuth().createCustomToken(uid);
  const response = await fetch(
    `http://${String(process.env.FIREBASE_AUTH_EMULATOR_HOST)}/identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=test`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    },
  );
  const body = (await response.json()) as { idToken?: string };
  if (!body.idToken) throw new Error(`no idToken from the Auth emulator: ${JSON.stringify(body)}`);
  return body.idToken;
}

describe('callableGateway over HTTP', () => {
  let server: Server;
  let baseUrl: string;

  const call = (name: string, data: unknown, idToken?: string) =>
    fetch(`${baseUrl}/callableGateway/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(idToken ? { authorization: `Bearer ${idToken}` } : {}) },
      body: JSON.stringify({ data }),
    });

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use((req, res) => {
      void callableGateway(req as unknown as Request, res);
    });
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => {
        resolve(listening);
      });
    });
    baseUrl = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  });

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve));
    delete process.env.OBSERVABILITY_USER_ID_SALT;
  });

  it('serves a routed callable to its signed-in caller', async () => {
    const response = await call('getUserIdHash', {}, await idTokenFor(UID));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      result: { hash: createHmac('sha256', 'test-salt').update(UID).digest('hex') },
    });
  });

  it("keeps the callable's own refusal of an anonymous caller", async () => {
    const response = await call('getUserIdHash', {});
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { status: 'UNAUTHENTICATED' } });
  });

  it('answers an unknown callable with NOT_FOUND', async () => {
    const response = await call('noSuchCallable', {});
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { status: 'NOT_FOUND' } });
  });

  it('does not serve a callable kept outside the gateway', async () => {
    const response = await call('deleteAccount', {}, await idTokenFor(UID));
    expect(response.status).toBe(404);
  });
});

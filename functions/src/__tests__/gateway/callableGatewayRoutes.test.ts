import { describe, expect, it, vi } from 'vitest';
import type { Request } from 'firebase-functions/v2/https';
import type { Response } from 'express';

// Before the imports below run: a Storage trigger reads its bucket from
// FIREBASE_CONFIG at the moment it is defined.
vi.hoisted(() => {
  process.env.GCLOUD_PROJECT ??= 'demo-cultuvilla';
  process.env.FIREBASE_CONFIG ??= JSON.stringify({
    projectId: 'demo-cultuvilla',
    storageBucket: 'demo-cultuvilla.appspot.com',
  });
});

import {
  CALLABLE_GATEWAY_FUNCTION,
  CALLABLE_GATEWAY_REGION,
  isServedByCallableGateway,
} from '@cultuvilla/shared/firebase/callableGateway';

// The handler suites' setup file has already initialised the default app with
// its own options, and initApp's bare initializeApp() would then throw.
vi.mock('../../initApp', async () => {
  const admin = await import('firebase-admin');
  if (admin.apps.length === 0) admin.initializeApp();
  return {};
});

import * as deployed from '../../index';
import {
  CALLABLE_GATEWAY_MEMORY_MIB,
  CALLABLE_GATEWAY_TIMEOUT_SECONDS,
  routeCallableRequest,
} from '../../gateway/callableGateway';
import { CALLABLE_GATEWAY_ROUTES } from '../../gateway/routes';

interface Endpoint {
  region?: string[];
  callableTrigger?: unknown;
  httpsTrigger?: { invoker?: string[] };
  availableMemoryMb?: unknown;
  timeoutSeconds?: unknown;
  secretEnvironmentVariables?: { key: string }[];
  minInstances?: unknown;
  concurrency?: unknown;
  cpu?: unknown;
}

const endpointOf = (fn: unknown): Endpoint | undefined => (fn as { __endpoint?: Endpoint } | null)?.__endpoint;

const exportedCallables = Object.entries(deployed).filter(([, fn]) => endpointOf(fn)?.callableTrigger !== undefined);

// An unset option is recorded as a reset sentinel, not a number.
const declaredNumber = (value: unknown): number | null => (typeof value === 'number' ? value : null);

describe('callable gateway routing table', () => {
  it('finds the exported callables', () => {
    expect(exportedCallables.length).toBeGreaterThan(40);
  });

  // The client routes by the shared list alone: a callable it routes that the
  // table lacks is sent to a gateway that answers 404.
  it.each(exportedCallables)('%s is routed exactly when a client may route it', (name, fn) => {
    expect(CALLABLE_GATEWAY_ROUTES.get(name)).toBe(isServedByCallableGateway(name) ? fn : undefined);
  });

  it('routes only names index.ts exports, under the same name', () => {
    const exported = new Map<string, unknown>(exportedCallables);
    const strays = [...CALLABLE_GATEWAY_ROUTES].filter(([name, route]) => exported.get(name) !== route).map(([n]) => n);
    expect(strays).toEqual([]);
  });

  // A routed callable that needs more than one gateway request holds belongs
  // in CALLABLES_OUTSIDE_GATEWAY.
  it.each([...CALLABLE_GATEWAY_ROUTES])('%s fits in one gateway request', (_name, route) => {
    const endpoint = endpointOf(route);
    expect(declaredNumber(endpoint?.availableMemoryMb) ?? 0).toBeLessThanOrEqual(CALLABLE_GATEWAY_MEMORY_MIB);
    expect(declaredNumber(endpoint?.timeoutSeconds) ?? 0).toBeLessThanOrEqual(CALLABLE_GATEWAY_TIMEOUT_SECONDS);
  });
});

describe('the deployed callable gateway', () => {
  const gateway = endpointOf((deployed as Record<string, unknown>)[CALLABLE_GATEWAY_FUNCTION]);

  it('is a public HTTP function in the gateway region, exported under the name clients call', () => {
    expect(gateway?.httpsTrigger?.invoker).toEqual(['public']);
    expect(gateway?.region).toEqual([CALLABLE_GATEWAY_REGION]);
  });

  it('binds every secret a routed callable binds', () => {
    const bound = new Set((gateway?.secretEnvironmentVariables ?? []).map((secret) => secret.key));
    const unbound = [...CALLABLE_GATEWAY_ROUTES].flatMap(([name, route]) =>
      (endpointOf(route)?.secretEnvironmentVariables ?? [])
        .filter((secret) => !bound.has(secret.key))
        .map((secret) => `${name}: ${secret.key}`),
    );
    expect(unbound).toEqual([]);
    expect(bound.has('RESEND_API_KEY')).toBe(true);
  });

  it('shares one container across concurrent requests', () => {
    expect(gateway?.cpu).toBe(1);
    expect(gateway?.concurrency).toBe(80);
  });

  it('keeps no instance warm unless a project sets CALLABLE_GATEWAY_MIN_INSTANCES', () => {
    expect(String(gateway?.minInstances)).toContain('CALLABLE_GATEWAY_MIN_INSTANCES');
  });
});

describe('routeCallableRequest', () => {
  const reply = () => {
    const res = { status: vi.fn(), json: vi.fn() };
    res.status.mockReturnValue(res);
    return res;
  };
  const request = (path: string) => ({ path }) as unknown as Request;

  it.each([
    ['/registerToEvent', 'the cloudfunctions.net and emulator form'],
    ['/callableGateway/registerToEvent', 'the direct run.app form'],
  ])('hands %s (%s) to the route with the same request and response', async (path) => {
    const route = vi.fn();
    const req = request(path);
    const res = reply();
    await routeCallableRequest(new Map([['registerToEvent', route]]))(req, res as unknown as Response);
    expect(route).toHaveBeenCalledWith(req, res);
    expect(res.status).not.toHaveBeenCalled();
  });

  it.each(['/unknownCallable', '/', '/constructor', '/__proto__'])(
    'answers %s with the callable protocol NOT_FOUND error',
    async (path) => {
      const res = reply();
      await routeCallableRequest(new Map([['registerToEvent', vi.fn()]]))(request(path), res as unknown as Response);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ error: expect.objectContaining({ status: 'NOT_FOUND' }) });
    },
  );
});

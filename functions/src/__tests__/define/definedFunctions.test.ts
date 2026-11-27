import { describe, expect, it, vi } from 'vitest';

// Before the imports below run: a Storage trigger reads its bucket from
// FIREBASE_CONFIG at the moment it is defined.
vi.hoisted(() => {
  process.env.GCLOUD_PROJECT ??= 'demo-cultuvilla';
  process.env.FIREBASE_CONFIG ??= JSON.stringify({
    projectId: 'demo-cultuvilla',
    storageBucket: 'demo-cultuvilla.appspot.com',
  });
});

// The handler suites' setup file has already initialised the default app with
// its own options, and initApp's bare initializeApp() would then throw.
vi.mock('../../initApp', async () => {
  const admin = await import('firebase-admin');
  if (admin.apps.length === 0) admin.initializeApp();
  return {};
});

import * as deployed from '../../index';

import { defineCallable } from '../../shared/define/defineCallable';
import { DEFAULT_FUNCTIONS_REGION } from '../../shared/define/region';
import { definedFunctions, type DefinedKind } from '../../shared/define/registry';

interface Endpoint {
  region?: string[];
  callableTrigger?: unknown;
  httpsTrigger?: unknown;
  scheduleTrigger?: unknown;
  eventTrigger?: { eventType?: string };
}

const endpointOf = (fn: unknown): Endpoint | undefined => (fn as { __endpoint?: Endpoint } | null)?.__endpoint;

const exported = Object.entries(deployed).filter(([, fn]) => endpointOf(fn) !== undefined);

/** The kind a deployed endpoint is, read from the manifest Firebase deploys. */
function kindOf(endpoint: Endpoint): DefinedKind {
  if (endpoint.callableTrigger !== undefined) return 'callable';
  if (endpoint.httpsTrigger !== undefined) return 'http';
  if (endpoint.scheduleTrigger !== undefined) return 'schedule';
  if (endpoint.eventTrigger?.eventType?.startsWith('google.cloud.storage.')) return 'storageTrigger';
  return 'documentTrigger';
}

describe('every deployed function goes through src/shared/define', () => {
  it('finds the deployed functions', () => {
    expect(exported.length).toBeGreaterThan(90);
  });

  // A gateway routes by the name a definition records; a definition named
  // differently from its export would route a client to nothing.
  it.each(exported)('%s is defined under its export name', (name, fn) => {
    const defined = definedFunctions().get(name);
    expect(defined?.fn).toBe(fn);
    expect(defined?.kind).toBe(kindOf(endpointOf(fn) ?? {}));
  });
});

describe('defineCallable', () => {
  it('runs in the default region unless the definition names one', () => {
    expect(endpointOf(defineCallable('testDefault', {}, () => null))?.region).toEqual([DEFAULT_FUNCTIONS_REGION]);
    expect(endpointOf(defineCallable('testEurope', { region: 'europe-west1' }, () => null))?.region).toEqual([
      'europe-west1',
    ]);
  });
});

import { describe, expect, it } from 'vitest';

import {
  CALLABLE_GATEWAY_PROJECTS,
  callableGatewayUrl,
  isServedByCallableGateway,
  routesThroughCallableGateway,
} from '../../src/firebase/callableGateway';

describe('callable gateway routing', () => {
  it('keeps the firehoses and long cascades on their own services', () => {
    for (const name of ['logClientError', 'recordEntityView', 'deleteAccount', 'buildVillageWrapped', 'sendGroupMessage']) {
      expect(isServedByCallableGateway(name)).toBe(false);
    }
    expect(isServedByCallableGateway('registerToEvent')).toBe(true);
  });

  // Production joins on Álvaro's go (plan cloud-run-gateways); this test is the
  // line that changes with it.
  it('routes dev and beta clients only', () => {
    expect([...CALLABLE_GATEWAY_PROJECTS].sort()).toEqual(['cultuvilla-beta', 'villa-events']);
    expect(routesThroughCallableGateway('registerToEvent', 'cultuvilla-prod')).toBe(false);
    expect(routesThroughCallableGateway('registerToEvent', 'villa-events')).toBe(true);
  });

  it('builds the deployed and the emulator URL', () => {
    expect(callableGatewayUrl('a b', { projectId: 'villa-events' })).toBe(
      'https://europe-southwest1-villa-events.cloudfunctions.net/callableGateway/a%20b',
    );
    expect(callableGatewayUrl('x', { projectId: 'p', functionsEmulatorHost: '127.0.0.1:5001' })).toBe(
      'http://127.0.0.1:5001/p/europe-southwest1/callableGateway/x',
    );
  });

  it('refuses to build a URL without a project', () => {
    expect(() => callableGatewayUrl('x', { projectId: '' })).toThrow();
  });
});

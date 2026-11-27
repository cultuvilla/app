import { beforeEach, describe, expect, it, vi } from 'vitest';

const functions = vi.hoisted(() => ({ current: {} as Record<string, unknown> }));
vi.mock('../../src/firebase', () => ({ getFirebaseFunctions: vi.fn(() => functions.current) }));

const byName = vi.fn();
const byUrl = vi.fn();
vi.mock('firebase/functions', () => ({
  httpsCallable: vi.fn((...args: unknown[]) => {
    byName(...args);
    return 'by-name';
  }),
  httpsCallableFromURL: vi.fn((...args: unknown[]) => {
    byUrl(...args);
    return 'by-url';
  }),
}));

import { connectCallableGatewayEmulator } from '../../src/firebase/callableGatewayEmulator';
import { getCallable } from '../../src/services/callableTransport';

const onProject = (projectId: string) => ({ app: { options: { projectId } } });

describe('getCallable', () => {
  beforeEach(() => {
    byName.mockClear();
    byUrl.mockClear();
  });

  it('routes a light callable through the gateway on a project that has joined', () => {
    functions.current = onProject('cultuvilla-beta');
    expect(getCallable('registerToEvent')).toBe('by-url');
    expect(byUrl).toHaveBeenCalledWith(
      functions.current,
      'https://europe-southwest1-cultuvilla-beta.cloudfunctions.net/callableGateway/registerToEvent',
      undefined,
    );
  });

  it("keeps production on each callable's own service", () => {
    functions.current = onProject('cultuvilla-prod');
    expect(getCallable('registerToEvent')).toBe('by-name');
    expect(byName).toHaveBeenCalledWith(functions.current, 'registerToEvent');
  });

  it('keeps a callable outside the gateway on its own service, options included', () => {
    functions.current = onProject('villa-events');
    expect(getCallable('buildVillageWrapped', { timeout: 300_000 })).toBe('by-name');
    expect(byName).toHaveBeenCalledWith(functions.current, 'buildVillageWrapped', { timeout: 300_000 });
  });

  it('calls by name when the instance names no project', () => {
    functions.current = {};
    expect(getCallable('registerToEvent')).toBe('by-name');
  });

  it('sends gateway calls to the Functions emulator once it is connected', () => {
    functions.current = onProject('villa-events');
    connectCallableGatewayEmulator('10.0.2.2', 5001);
    getCallable('registerToEvent');
    expect(byUrl).toHaveBeenCalledWith(
      functions.current,
      'http://10.0.2.2:5001/villa-events/europe-southwest1/callableGateway/registerToEvent',
      undefined,
    );
  });
});

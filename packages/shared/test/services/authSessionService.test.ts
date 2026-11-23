import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/firebase', () => ({ getFirebaseFunctions: vi.fn(() => ({})) }));

const callableFn = vi.fn().mockResolvedValue({ data: { status: 'refused' } });
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn(() => callableFn) }));

import { httpsCallable } from 'firebase/functions';
import { restoreLegacySession } from '../../src/services/authSessionService';

describe('authSessionService', () => {
  it('restoreLegacySession calls the callable and returns its answer', async () => {
    const result = await restoreLegacySession('refresh', 'key');

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'restoreLegacySession');
    expect(callableFn).toHaveBeenCalledWith({ refreshToken: 'refresh', apiKey: 'key' });
    expect(result).toEqual({ status: 'refused' });
  });
});

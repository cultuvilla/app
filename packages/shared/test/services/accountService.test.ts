import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/firebase', () => ({ getFirebaseFunctions: vi.fn(() => ({})) }));
vi.mock('firebase/functions', () => ({ httpsCallable: vi.fn() }));

import { httpsCallable } from 'firebase/functions';
import { checkAccountDeletable, deleteAccount, isReauthRequiredError } from '../../src/services/accountService';
import { fakeCallable } from '../helpers/sdkFakes';

describe('checkAccountDeletable', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes the checkAccountDeletable callable and returns its blockers', async () => {
    const blockers = [{ scopeType: 'village' as const, scopeId: 'v1', name: 'Villa' }];
    const call = vi.fn().mockResolvedValue({ data: { blockers } });
    vi.mocked(httpsCallable).mockReturnValue(fakeCallable(call));

    const result = await checkAccountDeletable();

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'checkAccountDeletable');
    expect(call).toHaveBeenCalledWith();
    expect(result).toEqual({ blockers });
  });
});

describe('deleteAccount', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('invokes the deleteAccount callable as a reauth-capable client and returns its result', async () => {
    const call = vi.fn().mockResolvedValue({ data: { ok: true } });
    vi.mocked(httpsCallable).mockReturnValue(fakeCallable(call));

    const result = await deleteAccount();

    expect(httpsCallable).toHaveBeenCalledWith(expect.anything(), 'deleteAccount');
    expect(call).toHaveBeenCalledWith({ reauth: true });
    expect(result).toEqual({ ok: true });
  });
});

describe('isReauthRequiredError', () => {
  const details = { reason: 'requires-recent-login' };

  it('recognises the stale-sign-in refusal under either SDK prefix', () => {
    expect(isReauthRequiredError({ code: 'functions/failed-precondition', details })).toBe(true);
    expect(isReauthRequiredError({ code: 'failed-precondition', details })).toBe(true);
  });

  it('does not mistake the sole-admin refusal or other errors for it', () => {
    expect(isReauthRequiredError({ code: 'functions/failed-precondition' })).toBe(false);
    expect(isReauthRequiredError({ code: 'functions/failed-precondition', details: 'x' })).toBe(false);
    expect(isReauthRequiredError({ code: 'functions/unauthenticated', details })).toBe(false);
    expect(isReauthRequiredError(new Error('boom'))).toBe(false);
  });
});

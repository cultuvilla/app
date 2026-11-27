import { describe, it, expect, vi, afterEach } from 'vitest';
import { logger } from 'firebase-functions/v2';
import { isNotFound, updateIfStillExists } from '../../shared/notFound';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isNotFound', () => {
  it('recognises the admin SDK gRPC code and the string forms', () => {
    expect(isNotFound({ code: 5 })).toBe(true);
    expect(isNotFound({ code: 'NOT_FOUND' })).toBe(true);
    expect(isNotFound({ code: 'not-found' })).toBe(true);
  });

  it('is false for every other failure', () => {
    expect(isNotFound({ code: 7 })).toBe(false);
    expect(isNotFound({ code: 'permission-denied' })).toBe(false);
    expect(isNotFound(new Error('boom'))).toBe(false);
    expect(isNotFound(null)).toBe(false);
    expect(isNotFound(undefined)).toBe(false);
  });
});

describe('updateIfStillExists', () => {
  const context = { handler: 'testHandler', path: 'things/t1' };

  it('returns true when the write lands', async () => {
    const update = vi.fn(() => Promise.resolve());
    await expect(updateIfStillExists(update, context)).resolves.toBe(true);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('returns false on NOT_FOUND and logs it at INFO, never ERROR', async () => {
    const info = vi.spyOn(logger, 'info').mockImplementation(() => undefined);
    const error = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    await expect(updateIfStillExists(() => Promise.reject(Object.assign(new Error('gone'), { code: 5 })), context)).resolves.toBe(false);
    expect(info).toHaveBeenCalledWith('Update skipped: document deleted', {
      handler: 'testHandler',
      path: 'things/t1',
      reason: 'documentDeleted',
    });
    expect(error).not.toHaveBeenCalled();
  });

  it('propagates every other failure', async () => {
    const denied = Object.assign(new Error('denied'), { code: 7 });
    await expect(updateIfStillExists(() => Promise.reject(denied), context)).rejects.toBe(denied);
  });
});

// The retry bound the trigger seam owns: a retried trigger is deployed with
// retry on and drops an event older than its window; a trigger without a bound
// is not retried and handles any event it is given.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from 'firebase-functions/v2';

import {
  defineDocumentTrigger,
  eventAgeMs,
  TRIGGER_RETRY_WINDOW_MS,
} from '../../shared/define/defineDocumentTrigger';

const MINUTE = 60 * 1000;
const agoIso = (ms: number) => new Date(Date.now() - ms).toISOString();

interface Runnable {
  run: (event: unknown) => unknown;
  __endpoint: { eventTrigger: { retry?: boolean } };
}

const define = (name: string, retry: boolean) => {
  const handler = vi.fn(() => 'handled');
  const fn = defineDocumentTrigger(
    name,
    {
      kind: 'created',
      document: 'things/{thingId}',
      ...(retry
        ? { retry: { maxEventAgeMs: TRIGGER_RETRY_WINDOW_MS.perishable, abandonedMessage: 'thing alert dropped' } }
        : {}),
    },
    handler,
  ) as unknown as Runnable;
  return { fn, handler };
};

const fire = (fn: Runnable, ageMs: number) =>
  fn.run({ data: undefined, params: { thingId: 't1' }, time: agoIso(ageMs) });

afterEach(() => vi.restoreAllMocks());

describe('a retried document trigger', () => {
  it('is deployed retried', () => {
    expect(define('retriedDeployed', true).fn.__endpoint.eventTrigger.retry).toBe(true);
  });

  it('drops an event just past its window, logging which document and why', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { fn, handler } = define('retriedPast', true);

    await fire(fn, TRIGGER_RETRY_WINDOW_MS.perishable + MINUTE);

    expect(handler).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('thing alert dropped', expect.objectContaining({
      handler: 'retriedPast',
      thingId: 't1',
      eventAgeMs: expect.any(Number) as number,
      reason: 'past-retry-window',
    }));
  });

  it('handles an event just inside its window', async () => {
    const { fn, handler } = define('retriedInside', true);
    expect(await fire(fn, TRIGGER_RETRY_WINDOW_MS.perishable - MINUTE)).toBe('handled');
    expect(handler).toHaveBeenCalledOnce();
  });

  it('handles an event with no parseable time rather than dropping it', async () => {
    const { fn, handler } = define('retriedNoTime', true);
    await fn.run({ data: undefined, params: { thingId: 't1' }, time: 'not a time' });
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('a document trigger without a retry bound', () => {
  it('is not deployed retried', () => {
    expect(define('unretriedDeployed', false).fn.__endpoint.eventTrigger.retry).not.toBe(true);
  });

  it('handles an event of any age', async () => {
    const { fn, handler } = define('unretriedOld', false);
    await fire(fn, 30 * 24 * 60 * MINUTE);
    expect(handler).toHaveBeenCalledOnce();
  });
});

describe('eventAgeMs', () => {
  it('is the time since the event, or null when it has none', () => {
    expect(eventAgeMs({ time: '2026-01-01T00:00:00.000Z' }, Date.parse('2026-01-01T00:01:00.000Z'))).toBe(MINUTE);
    expect(eventAgeMs({})).toBeNull();
  });
});

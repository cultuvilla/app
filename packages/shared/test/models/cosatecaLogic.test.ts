import { describe, it, expect } from 'vitest';
import {
  availableCosaRequestActions,
  cosaDatesOverlap,
  isCosaRequestOverdue,
  nextCosaRequestStatus,
} from '../../src/models/organization/cosatecaLogic';
import { effectiveCosaAudience } from '../../src/models/organization/CosaDataModel';
import { buildCosaRequestData, CosaRequestDataSchema } from '../../src/models/organization/CosaRequestDataModel';

describe('nextCosaRequestStatus', () => {
  it('walks a loan from request to return', () => {
    expect(nextCosaRequestStatus('prestamo', 'pending', 'accept', ['manager'])).toEqual({ ok: true, to: 'accepted' });
    expect(nextCosaRequestStatus('prestamo', 'accepted', 'lend', ['manager'])).toEqual({ ok: true, to: 'lent' });
    expect(nextCosaRequestStatus('prestamo', 'lent', 'return', ['manager'])).toEqual({ ok: true, to: 'returned' });
  });

  it('ends a servicio as done (either side) and a regalo as given', () => {
    expect(nextCosaRequestStatus('servicio', 'accepted', 'done', ['requester'])).toEqual({ ok: true, to: 'done' });
    expect(nextCosaRequestStatus('servicio', 'accepted', 'done', ['manager'])).toEqual({ ok: true, to: 'done' });
    expect(nextCosaRequestStatus('regalo', 'accepted', 'give', ['manager'])).toEqual({ ok: true, to: 'given' });
  });

  it('refuses a move the kind does not have', () => {
    expect(nextCosaRequestStatus('servicio', 'accepted', 'lend', ['manager'])).toEqual({ ok: false, reason: 'not-allowed' });
    expect(nextCosaRequestStatus('regalo', 'accepted', 'return', ['manager'])).toEqual({ ok: false, reason: 'not-allowed' });
  });

  it('keeps each move to its side', () => {
    expect(nextCosaRequestStatus('prestamo', 'pending', 'accept', ['requester'])).toEqual({ ok: false, reason: 'not-your-role' });
    expect(nextCosaRequestStatus('prestamo', 'pending', 'cancel', ['manager'])).toEqual({ ok: false, reason: 'not-your-role' });
    expect(nextCosaRequestStatus('prestamo', 'lent', 'return', ['requester'])).toEqual({ ok: false, reason: 'not-your-role' });
  });

  it('refuses a move from the wrong state', () => {
    expect(nextCosaRequestStatus('prestamo', 'lent', 'cancel', ['requester'])).toEqual({ ok: false, reason: 'wrong-state' });
    expect(nextCosaRequestStatus('prestamo', 'pending', 'lend', ['manager'])).toEqual({ ok: false, reason: 'wrong-state' });
    expect(nextCosaRequestStatus('prestamo', 'declined', 'accept', ['manager'])).toEqual({ ok: false, reason: 'wrong-state' });
  });
});

describe('availableCosaRequestActions', () => {
  it('offers the manager the answer and the requester the way out', () => {
    expect(availableCosaRequestActions('prestamo', 'pending', ['manager'])).toEqual(['accept', 'decline']);
    expect(availableCosaRequestActions('prestamo', 'pending', ['requester'])).toEqual(['cancel']);
    expect(availableCosaRequestActions('prestamo', 'accepted', ['manager'])).toEqual(['decline', 'lend']);
    expect(availableCosaRequestActions('prestamo', 'returned', ['manager', 'requester'])).toEqual([]);
  });
});

describe('cosaDatesOverlap', () => {
  const r = (fromOn: string | null, untilOn: string | null) => ({ fromOn, untilOn });
  it('sees disjoint ranges apart, touching ones together', () => {
    expect(cosaDatesOverlap(r('2026-07-01', '2026-07-03'), r('2026-07-04', '2026-07-05'))).toBe(false);
    expect(cosaDatesOverlap(r('2026-07-04', '2026-07-05'), r('2026-07-01', '2026-07-03'))).toBe(false);
    expect(cosaDatesOverlap(r('2026-07-01', '2026-07-03'), r('2026-07-03', '2026-07-05'))).toBe(true);
  });
  it('treats missing dates as open-ended: one undated loan at a time', () => {
    expect(cosaDatesOverlap(r(null, null), r(null, null))).toBe(true);
    expect(cosaDatesOverlap(r(null, '2026-07-03'), r('2026-07-04', null))).toBe(false);
    expect(cosaDatesOverlap(r('2026-07-04', null), r('2026-08-01', '2026-08-02'))).toBe(true);
  });
});

describe('isCosaRequestOverdue', () => {
  it('is overdue only when lent past its day', () => {
    expect(isCosaRequestOverdue({ status: 'lent', untilOn: '2026-07-03' }, '2026-07-04')).toBe(true);
    expect(isCosaRequestOverdue({ status: 'lent', untilOn: '2026-07-04' }, '2026-07-04')).toBe(false);
    expect(isCosaRequestOverdue({ status: 'lent', untilOn: null }, '2026-07-04')).toBe(false);
    expect(isCosaRequestOverdue({ status: 'returned', untilOn: '2026-07-01' }, '2026-07-04')).toBe(false);
  });
});

describe('cosateca models', () => {
  it('opens to the pueblo only while enabled', () => {
    expect(effectiveCosaAudience({ enabled: true, audience: 'pueblo' })).toBe('pueblo');
    expect(effectiveCosaAudience({ enabled: false, audience: 'pueblo' })).toBe('integrantes');
    expect(effectiveCosaAudience({ enabled: true, audience: 'integrantes' })).toBe('integrantes');
  });

  it('refuses a request whose dates run backwards', () => {
    const base = { municipalityId: 'm', orgId: 'o', cosaId: 'c', cosaTitle: 'T', cosaKind: 'prestamo' as const, ownerUid: 'u1', requesterUid: 'u2', requesterName: 'L' };
    expect(CosaRequestDataSchema.safeParse(buildCosaRequestData({ ...base, fromOn: '2026-07-05', untilOn: '2026-07-01' })).success).toBe(false);
    expect(CosaRequestDataSchema.safeParse(buildCosaRequestData({ ...base, fromOn: '2026-07-01', untilOn: '2026-07-05', message: '  ' }))).toMatchObject({
      success: true,
      data: { message: null, status: 'pending' },
    });
  });
});

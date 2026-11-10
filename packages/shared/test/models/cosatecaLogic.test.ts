import { describe, it, expect } from 'vitest';
import {
  availableCosaRequestActions,
  cosaAvailability,
  cosaChatPushUids,
  cosaOverdueRecipients,
  cosaDatesOverlap,
  cosaRequestRoles,
  cosatecaCatalogue,
  usedCosaCategories,
  COSA_CHAT_CLOSE_DAYS,
  isCosaChatOpen,
  isCosaRequestOverdue,
  nextCosaRequestStatus,
} from '../../src/models/organization/cosatecaLogic';
import { effectiveCosaAudience } from '../../src/models/organization/CosaDataModel';
import {
  buildCosaRequestData,
  CosaRequestDataSchema,
  cosaRequestChatMessagePath,
  parseCosaRequestChatMessagePath,
} from '../../src/models/organization/CosaRequestDataModel';

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

describe('cosaRequestRoles', () => {
  const req = { ownerUid: 'owner', requesterUid: 'asker' };
  it('makes the owner and any admin of the group its manager', () => {
    expect(cosaRequestRoles(req, { uid: 'owner', isGroupAdmin: false })).toEqual(['manager']);
    expect(cosaRequestRoles(req, { uid: 'admin', isGroupAdmin: true })).toEqual(['manager']);
  });
  it('makes the asker its requester, and an admin who asked both', () => {
    expect(cosaRequestRoles(req, { uid: 'asker', isGroupAdmin: false })).toEqual(['requester']);
    expect(cosaRequestRoles({ ownerUid: null, requesterUid: 'asker' }, { uid: 'asker', isGroupAdmin: true })).toEqual([
      'manager',
      'requester',
    ]);
  });
  it('gives a group cosa no owner to match, and a stranger nothing', () => {
    expect(cosaRequestRoles({ ownerUid: null, requesterUid: 'asker' }, { uid: 'someone', isGroupAdmin: false })).toEqual([]);
  });
});

describe('cosaAvailability', () => {
  it('reads given, out with someone, paused or free', () => {
    const heldBy = { requestId: 'r', uid: 'u', name: 'Ana', untilOn: null };
    expect(cosaAvailability({ status: 'given', heldBy: null })).toBe('given');
    expect(cosaAvailability({ status: 'available', heldBy })).toBe('lent');
    expect(cosaAvailability({ status: 'paused', heldBy })).toBe('lent');
    expect(cosaAvailability({ status: 'paused', heldBy: null })).toBe('paused');
    expect(cosaAvailability({ status: 'available', heldBy: null })).toBe('available');
  });
});

describe('the catalogue', () => {
  const cosas = [
    { title: 'Taladro', category: 'herramientas' as const, status: 'available' as const },
    { title: 'Carpa', category: 'fiestas' as const, status: 'paused' as const },
    { title: 'Bici', category: 'deporte' as const, status: 'given' as const },
    { title: 'Azada', category: 'herramientas' as const, status: 'available' as const },
  ];
  it('drops regalos that have gone and sorts by title, filtered by category', () => {
    expect(cosatecaCatalogue(cosas, null).map((c) => c.title)).toEqual(['Azada', 'Carpa', 'Taladro']);
    expect(cosatecaCatalogue(cosas, 'herramientas').map((c) => c.title)).toEqual(['Azada', 'Taladro']);
    expect(cosatecaCatalogue(cosas, 'deporte')).toEqual([]);
  });
  it('lists the categories in use, in the fixed order', () => {
    expect(usedCosaCategories(cosas)).toEqual(['herramientas', 'fiestas']);
  });
});

describe("a request's chat", () => {
  it('pushes the requester and the managers, never the author, each once', () => {
    expect(cosaChatPushUids({ requesterUid: 'asker' }, ['owner'], 'asker')).toEqual(['owner']);
    expect(cosaChatPushUids({ requesterUid: 'asker' }, ['a1', 'a2', 'a1'], 'a1')).toEqual(['asker', 'a2']);
  });
  it('round-trips a message path for reports, and rejects any other path', () => {
    const path = cosaRequestChatMessagePath('r1', 'm1');
    expect(path).toBe('cosaRequests/r1/chat/m1');
    expect(parseCosaRequestChatMessagePath(path)).toEqual({ requestId: 'r1', chatId: 'm1' });
    expect(parseCosaRequestChatMessagePath('organizations/o1/chat/m1')).toBeNull();
    expect(parseCosaRequestChatMessagePath('cosaRequests/r1/chat/m1/extra')).toBeNull();
  });
});

describe('cosaOverdueRecipients', () => {
  it('nudges the holder, and the managers who are not the holder', () => {
    expect(cosaOverdueRecipients({ requesterUid: 'asker' }, ['owner'])).toEqual({ holder: 'asker', managers: ['owner'] });
    // An admin who borrowed the group's cosa is told once, as the holder.
    expect(cosaOverdueRecipients({ requesterUid: 'a1' }, ['a1', 'a2'])).toEqual({ holder: 'a1', managers: ['a2'] });
  });
});

describe("a request's chat closes after the request ends", () => {
  const DAY = 24 * 60 * 60 * 1000;
  const ended = new Date('2026-11-01T10:00:00Z');
  const at = (days: number) => new Date(ended.getTime() + days * DAY);
  const req = (status: Parameters<typeof isCosaChatOpen>[0]['status'], over: Partial<Parameters<typeof isCosaChatOpen>[0]> = {}) => ({
    status, closedAt: ended, respondedAt: null, createdAt: new Date('2026-10-20T10:00:00Z'), ...over,
  });

  it('closes 14 days after it ended', () => {
    expect(COSA_CHAT_CLOSE_DAYS).toBe(14);
    expect(isCosaChatOpen(req('returned'), at(13))).toBe(true);
    expect(isCosaChatOpen(req('returned'), at(14))).toBe(true);
    expect(isCosaChatOpen(req('returned'), at(15))).toBe(false);
    for (const status of ['declined', 'cancelled', 'done', 'given'] as const) {
      expect(isCosaChatOpen(req(status), at(15))).toBe(false);
    }
  });

  it('stays open while the request is in play, however old', () => {
    for (const status of ['pending', 'accepted', 'lent'] as const) {
      expect(isCosaChatOpen(req(status, { closedAt: null }), at(400))).toBe(true);
    }
  });

  it('counts from when it was answered, then when it was made, if it has no closedAt', () => {
    expect(isCosaChatOpen(req('declined', { closedAt: null, respondedAt: ended }), at(15))).toBe(false);
    expect(isCosaChatOpen(req('declined', { closedAt: null, respondedAt: ended }), at(13))).toBe(true);
    // Made on 2026-10-20: 15 days later it is closed.
    expect(isCosaChatOpen(req('cancelled', { closedAt: null }), at(3))).toBe(false);
    expect(isCosaChatOpen(req('cancelled', { closedAt: null }), at(1))).toBe(true);
  });
});

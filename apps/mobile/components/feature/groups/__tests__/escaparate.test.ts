import { buildCosaData, buildCosaRequestData } from '@cultuvilla/shared/models/organization';
import {
  cosaCardSubtitle,
  cosaKindWord,
  cosaStatusChip,
  cosatecaInbox,
  enMarcha,
  holdingUntil,
  searchCosas,
} from '../cosateca/escaparate';

const t = (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key);

function cosa(over: Record<string, unknown> = {}) {
  return {
    ...buildCosaData({
      municipalityId: 'm1', orgId: 'pena', audience: 'integrantes', ownerUid: 'u2', ownerName: 'Julián', kind: 'prestamo',
      title: 'Escalera', category: 'herramientas', createdBy: 'u2', createdByName: 'Julián',
    }),
    ...over,
  };
}

function request(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    ...buildCosaRequestData({
      municipalityId: 'm1', orgId: 'pena', cosaId: 'c1', cosaTitle: 'Taladro', cosaKind: 'prestamo', ownerUid: 'u1',
      requesterUid: 'u3', requesterName: 'Pepa', createdAt: new Date(2026, 0, Number(id.slice(1))),
    }),
    ...over,
  };
}

describe('searchCosas', () => {
  const cosas = [
    cosa({ title: 'Paellera 80 cm' }),
    cosa({ title: 'Carpa', description: 'Tres por seis, con piquetas' }),
    cosa({ title: 'Cortar el pelo', ownerName: 'Rosa' }),
  ];
  it('matches every word in the name, description or owner, accents and case aside', () => {
    expect(searchCosas(cosas, 'PAELLERA').map((c) => c.title)).toEqual(['Paellera 80 cm']);
    expect(searchCosas(cosas, 'piquétas tres').map((c) => c.title)).toEqual(['Carpa']);
    expect(searchCosas(cosas, 'rosa').map((c) => c.title)).toEqual(['Cortar el pelo']);
    expect(searchCosas(cosas, 'carpa rosa')).toEqual([]);
  });
  it('keeps everything for an empty query', () => {
    expect(searchCosas(cosas, '  ')).toHaveLength(3);
  });
});

describe('cosaStatusChip', () => {
  it('says "Libre" when it can be asked for', () => {
    expect(cosaStatusChip(t, cosa())).toEqual({ label: 'groups.cosateca.chip.free', free: true });
  });
  it('says until when it is out, or just that it is lent', () => {
    const heldBy = { uid: 'u3', name: 'Pepa', requestId: 'r1', since: new Date(), untilOn: '2026-11-18' };
    expect(cosaStatusChip(t, cosa({ heldBy })).label).toMatch(/groups.cosateca.chip.until.*18 nov/);
    expect(cosaStatusChip(t, cosa({ heldBy: { ...heldBy, untilOn: null } })).label).toBe('groups.cosateca.chip.lent');
  });
  it('says when it is paused', () => {
    expect(cosaStatusChip(t, cosa({ status: 'paused' }))).toEqual({ label: 'groups.cosateca.availability.paused', free: false });
  });
});

describe("a card's words", () => {
  it('says the kind in words, but not for a préstamo', () => {
    expect(cosaKindWord(t, 'prestamo')).toBeNull();
    expect(cosaKindWord(t, 'reserva')).toBe('groups.cosateca.kindWords.reserva');
  });
  it('names who offers it, then how it is shared or else where it is kept', () => {
    expect(cosaCardSubtitle(t, cosa({ kind: 'servicio', ownerName: 'Rosa' }))).toBe('Rosa · groups.cosateca.kindWords.servicio');
    expect(cosaCardSubtitle(t, cosa({ ownerUid: null, locationNote: 'almacén' }))).toBe('groups.cosateca.ofGroup · almacén');
    expect(cosaCardSubtitle(t, cosa())).toBe('Julián');
  });
});

describe('enMarcha', () => {
  const today = '2026-11-21';
  const split = (incoming: ReturnType<typeof request>[], mine: ReturnType<typeof request>[]) => {
    const { toca, curso } = enMarcha(incoming, mine, 'u1', today);
    return { toca: toca.map((i) => `${i.reason}:${i.request.id}`), curso: curso.map((i) => `${i.reason}:${i.request.id}`) };
  };

  it('puts what waits on me in "Te toca": answers, hand-overs and what is late, the late first', () => {
    const incoming = [
      request('r1'),
      request('r2', { status: 'accepted' }),
      request('r3', { status: 'accepted', cosaKind: 'servicio' }),
      request('r4', { status: 'accepted', cosaKind: 'regalo' }),
      request('r5', { status: 'lent', untilOn: '2026-11-18' }),
      request('r6', { status: 'declined' }),
    ];
    expect(split(incoming, []).toca).toEqual(['overdueLent:r5', 'answer:r1', 'handOver:r2', 'finish:r3', 'give:r4']);
  });

  it('keeps what waits on someone else or on a date in "En curso", soonest first', () => {
    const incoming = [
      request('r1', { status: 'lent', untilOn: '2026-11-30' }),
      request('r2', { status: 'accepted', cosaKind: 'reserva', fromOn: '2026-12-03', untilOn: '2026-12-03' }),
    ];
    const mine = [
      request('r3', { requesterUid: 'u1', status: 'lent', untilOn: '2026-11-25' }),
      request('r4', { requesterUid: 'u1', status: 'pending' }),
      request('r5', { requesterUid: 'u1', status: 'accepted' }),
    ];
    const { toca, curso } = split(incoming, mine);
    expect(toca).toEqual([]);
    expect(curso).toEqual(['holding:r3', 'lentOut:r1', 'booked:r2', 'accepted:r5', 'waiting:r4']);
  });

  it('makes a loan I hold past its date mine to sort out, with no one-tap move', () => {
    const { toca } = enMarcha([], [request('r1', { requesterUid: 'u1', status: 'lent', untilOn: '2026-11-18' })], 'u1', today);
    expect(toca).toEqual([expect.objectContaining({ reason: 'overdueHeld', late: true, primary: null })]);
  });

  it("leaves a group's cosa someone holds to that holder, and a handed-on one out", () => {
    const incoming = [
      request('r1', { ownerUid: null, holderUid: 'u9' }),
      request('r2', { ownerUid: null, holderUid: null, status: 'lent' }),
      request('r3', { ownerUid: null, holderUid: 'u1' }),
    ];
    expect(split(incoming, [])).toEqual({ toca: ['answer:r3'], curso: [] });
  });

  it('never asks me to answer my own request', () => {
    const own = request('r1', { requesterUid: 'u1', ownerUid: null });
    expect(split([own], [own])).toEqual({ toca: [], curso: ['waiting:r1'] });
  });
});

describe('holdingUntil', () => {
  it("gives the date it goes back, but none for a group's cosa that travels on", () => {
    expect(holdingUntil({ untilOn: '2026-11-14', cosaKind: 'prestamo', ownerUid: 'u1' })).toBe('2026-11-14');
    expect(holdingUntil({ untilOn: '2026-11-14', cosaKind: 'prestamo', ownerUid: null })).toBeNull();
  });
});

describe('cosatecaInbox', () => {
  it('merges both sides once each, open ones first, then newest', () => {
    const incoming = [request('r1'), request('r3', { status: 'returned' })];
    const mine = [request('r2', { status: 'cancelled' }), request('r1')];
    expect(cosatecaInbox(incoming, mine).map((r) => r.id)).toEqual(['r1', 'r3', 'r2']);
  });
});

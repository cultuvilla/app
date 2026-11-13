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
  it('lists what is asked of me (pending first), then what I hold, the soonest back first', () => {
    const incoming = [request('r1', { status: 'accepted' }), request('r2'), request('r3', { status: 'declined' }), request('r4', { status: 'lent' })];
    const mine = [
      request('r5', { status: 'lent', untilOn: null }),
      request('r6', { status: 'lent', untilOn: '2026-11-14' }),
      request('r7', { status: 'pending' }),
    ];
    expect(enMarcha(incoming, mine).map((i) => `${i.type}:${i.request.id}`)).toEqual([
      'asked:r2', 'asked:r1', 'holding:r6', 'holding:r5',
    ]);
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

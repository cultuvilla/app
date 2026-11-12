import { cosaAvailabilityLabel, cosaHeldSinceLabel, cosaOwnerLabel, cosaRequestDatesLabel, cosatecaErrorMessage } from '../cosateca';

const t = (k: string, v?: Record<string, string | number>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k);

describe('cosateca labels', () => {
  it('says who has a lent cosa and until when', () => {
    const heldBy = { requestId: 'r', uid: 'u', name: 'Ana', untilOn: null, since: new Date('2026-10-03T10:00:00Z') };
    expect(cosaAvailabilityLabel(t, { status: 'available', heldBy })).toBe('groups.cosateca.availability.lent:Ana');
    expect(cosaAvailabilityLabel(t, { status: 'available', heldBy: { ...heldBy, untilOn: '2026-08-03' } })).toMatch(
      /^groups\.cosateca\.availability\.lentUntil:Ana\|/,
    );
    expect(cosaAvailabilityLabel(t, { status: 'paused', heldBy: null })).toBe('groups.cosateca.availability.paused');
  });

  it('says who has it and since when', () => {
    expect(cosaHeldSinceLabel(t, { name: 'Ana', since: new Date('2026-10-03T10:00:00Z') })).toMatch(
      /^groups\.cosateca\.detail\.heldSince:Ana\|.*octubre/,
    );
  });

  it("names the owner, or the group for the group's own", () => {
    expect(cosaOwnerLabel(t, { ownerUid: 'u1', ownerName: 'Ana' })).toBe('Ana');
    expect(cosaOwnerLabel(t, { ownerUid: null, ownerName: 'Peña' })).toBe('groups.cosateca.ofGroup');
  });

  it('reads the dates asked for, whichever are set', () => {
    expect(cosaRequestDatesLabel(t, { fromOn: null, untilOn: null })).toBe('groups.cosateca.request.noDates');
    expect(cosaRequestDatesLabel(t, { fromOn: '2026-07-01', untilOn: '2026-07-03' })).toMatch(/^groups\.cosateca\.request\.range:/);
    expect(cosaRequestDatesLabel(t, { fromOn: '2026-07-01', untilOn: null })).toMatch(/^groups\.cosateca\.request\.fromOnly:/);
    expect(cosaRequestDatesLabel(t, { fromOn: null, untilOn: '2026-07-03' })).toMatch(/^groups\.cosateca\.request\.untilOnly:/);
    // A booking shows its slot instead.
    const label = cosaRequestDatesLabel(t, {
      fromOn: '2026-11-12', untilOn: '2026-11-12', startAt: new Date('2026-11-12T17:00:00.000Z'), endAt: new Date('2026-11-12T18:00:00.000Z'),
    });
    expect(label).toContain('·');
    expect(label).not.toMatch(/^groups\./);
  });

  it("passes on the callable's own reason, and maps the rest", () => {
    const refused = Object.assign(new Error('Ya está prestada o comprometida en esas fechas.'), { code: 'functions/failed-precondition' });
    expect(cosatecaErrorMessage(t, refused)).toBe('Ya está prestada o comprometida en esas fechas.');
    expect(cosatecaErrorMessage(t, Object.assign(new Error('x'), { code: 'permission-denied' }))).toBe('groups.cosateca.errors.permission');
    expect(cosatecaErrorMessage(t, new Error('boom'))).toBe('groups.cosateca.errors.generic');
    // The booking callable's own refusals are shown as they are.
    expect(cosatecaErrorMessage(t, Object.assign(new Error('Esa hora ya está reservada.'), { code: 'functions/already-exists' }))).toBe(
      'Esa hora ya está reservada.',
    );
    expect(cosatecaErrorMessage(t, Object.assign(new Error('Ya tienes 2 reservas'), { code: 'functions/resource-exhausted' }))).toBe(
      'Ya tienes 2 reservas',
    );
  });
});

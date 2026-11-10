import { cosaAvailabilityLabel, cosaOwnerLabel, cosaRequestDatesLabel, cosatecaErrorMessage } from '../cosateca';

const t = (k: string, v?: Record<string, string | number>) => (v ? `${k}:${Object.values(v).map(String).join('|')}` : k);

describe('cosateca labels', () => {
  it('says who has a lent cosa and until when', () => {
    const heldBy = { requestId: 'r', uid: 'u', name: 'Ana', untilOn: null };
    expect(cosaAvailabilityLabel(t, { status: 'available', heldBy })).toBe('groups.cosateca.availability.lent:Ana');
    expect(cosaAvailabilityLabel(t, { status: 'available', heldBy: { ...heldBy, untilOn: '2026-08-03' } })).toMatch(
      /^groups\.cosateca\.availability\.lentUntil:Ana\|/,
    );
    expect(cosaAvailabilityLabel(t, { status: 'paused', heldBy: null })).toBe('groups.cosateca.availability.paused');
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
  });

  it("passes on the callable's own reason, and maps the rest", () => {
    const refused = Object.assign(new Error('Ya está prestada o comprometida en esas fechas.'), { code: 'functions/failed-precondition' });
    expect(cosatecaErrorMessage(t, refused)).toBe('Ya está prestada o comprometida en esas fechas.');
    expect(cosatecaErrorMessage(t, Object.assign(new Error('x'), { code: 'permission-denied' }))).toBe('groups.cosateca.errors.permission');
    expect(cosatecaErrorMessage(t, new Error('boom'))).toBe('groups.cosateca.errors.generic');
  });
});

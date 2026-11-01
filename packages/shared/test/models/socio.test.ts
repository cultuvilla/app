import { describe, it, expect } from 'vitest';
import {
  buildSocioData,
  buildSocioPrivateData,
  hasSocioRoster,
  isActiveSocio,
  nextSocioNumber,
  parseSocioNumber,
  requiresSocioContact,
  socioContactMissing,
  socioNumberTaken,
  SocioDataSchema,
  SocioPrivateDataSchema,
} from '../../src/models/organization/SocioDataModel';

describe('hasSocioRoster', () => {
  it('is true for the associative kinds and false for the ayuntamiento', () => {
    expect(hasSocioRoster('asociación')).toBe(true);
    expect(hasSocioRoster('peña')).toBe(true);
    expect(hasSocioRoster('otros')).toBe(true);
    expect(hasSocioRoster('comisión')).toBe(true);
    expect(hasSocioRoster('ayuntamiento')).toBe(false);
  });
});

describe('buildSocioData', () => {
  it('builds a member row: own uid, no responsible, active', () => {
    const altaAt = new Date('2026-01-01');
    const row = buildSocioData({ kind: 'member', displayName: 'Ana', uid: 'u1', createdBy: 'u1', altaAt, memberJoinedAt: altaAt });
    expect(row).toEqual({
      kind: 'member',
      socioNumber: null,
      displayName: 'Ana',
      uid: 'u1',
      personId: null,
      responsibleUid: null,
      adminTitle: null,
      altaAt,
      bajaAt: null,
      memberJoinedAt: altaAt,
      createdBy: 'u1',
    });
    expect(SocioDataSchema.parse(row)).toEqual(row);
    expect(isActiveSocio(row)).toBe(true);
  });

  it('builds a persona row pointing at the persona and its responsible member', () => {
    const row = buildSocioData({
      kind: 'persona',
      displayName: 'Lucía',
      personId: 'p1',
      responsibleUid: 'u1',
      createdBy: 'u1',
    });
    expect(row.uid).toBeNull();
    expect(row.personId).toBe('p1');
    expect(row.responsibleUid).toBe('u1');
  });

  it('a row with a baja date is not active', () => {
    const row = buildSocioData({ kind: 'typed', displayName: 'Paco', createdBy: 'admin' });
    expect(isActiveSocio({ ...row, bajaAt: new Date() })).toBe(false);
  });

  it('keeps a given socio number and refuses one out of range', () => {
    const row = buildSocioData({ kind: 'typed', displayName: 'Paco', socioNumber: 57, createdBy: 'admin' });
    expect(SocioDataSchema.parse(row).socioNumber).toBe(57);
    expect(() => SocioDataSchema.parse({ ...row, socioNumber: 0 })).toThrow();
    expect(() => SocioDataSchema.parse({ ...row, socioNumber: 1.5 })).toThrow();
    expect(() => SocioDataSchema.parse({ ...row, socioNumber: 100000 })).toThrow();
  });

  it('rejects a row without the socioNumber field', () => {
    const { socioNumber: _omit, ...legacy } = buildSocioData({ kind: 'typed', displayName: 'Paco', createdBy: 'admin' });
    expect(() => SocioDataSchema.parse(legacy)).toThrow();
  });

  it('rejects an unknown admin title', () => {
    const row = buildSocioData({ kind: 'member', displayName: 'Ana', uid: 'u1', createdBy: 'u1' });
    expect(() => SocioDataSchema.parse({ ...row, adminTitle: 'rey' })).toThrow();
  });
});

describe('buildSocioPrivateData', () => {
  it('trims and nulls blank contact fields', () => {
    expect(buildSocioPrivateData({ phone: '  ', email: ' a@b.es ' })).toEqual({
      phone: null,
      email: 'a@b.es',
      consentAnsweredAt: null,
    });
  });

  it('records when the socio answered the consent question', () => {
    const at = new Date('2026-10-20');
    const data = buildSocioPrivateData({ phone: '600000000', email: null, consentAnsweredAt: at });
    expect(SocioPrivateDataSchema.parse(data)).toEqual({ phone: '600000000', email: null, consentAnsweredAt: at });
  });
});

describe('socio numbers', () => {
  it('the next number passes both the counter and any number set by hand', () => {
    expect(nextSocioNumber(0, null)).toBe(1);
    expect(nextSocioNumber(4, 2)).toBe(5);
    expect(nextSocioNumber(4, 200)).toBe(201);
  });

  it('parses what an admin types: blank is no number, junk is invalid', () => {
    expect(parseSocioNumber('  ')).toBeNull();
    expect(parseSocioNumber(' 57 ')).toBe(57);
    expect(parseSocioNumber('0')).toBeUndefined();
    expect(parseSocioNumber('5,7')).toBeUndefined();
    expect(parseSocioNumber('-3')).toBeUndefined();
    expect(parseSocioNumber('100000')).toBeUndefined();
  });

  it('a number is taken by any other row, bajas included', () => {
    const rows = [{ id: 'a', socioNumber: 1 }, { id: 'b', socioNumber: null }];
    expect(socioNumberTaken(rows, 1, null)).toBe(true);
    expect(socioNumberTaken(rows, 1, 'a')).toBe(false);
    expect(socioNumberTaken(rows, 2, null)).toBe(false);
  });
});

describe('socioContactMissing', () => {
  const both = { socioPhoneRequired: true, socioEmailRequired: true };
  const none = { socioPhoneRequired: false, socioEmailRequired: false };

  it('asks only for what the group requires and the socio has not shared', () => {
    expect(requiresSocioContact(none)).toBe(false);
    expect(requiresSocioContact(both)).toBe(true);
    expect(socioContactMissing(none, null)).toBe(false);
    expect(socioContactMissing(both, null)).toBe(true);
    expect(socioContactMissing(both, { phone: '600', email: null })).toBe(true);
    expect(socioContactMissing(both, { phone: '600', email: 'a@x.es' })).toBe(false);
    expect(socioContactMissing({ socioPhoneRequired: true, socioEmailRequired: false }, { phone: '600', email: null })).toBe(false);
  });
});

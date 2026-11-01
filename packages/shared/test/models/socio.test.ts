import { describe, it, expect } from 'vitest';
import {
  buildSocioData,
  buildSocioPrivateData,
  hasSocioRoster,
  isActiveSocio,
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

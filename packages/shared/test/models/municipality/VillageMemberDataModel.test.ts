import { describe, it, expect } from 'vitest';
import {
  VillageMemberDataSchema,
  buildVillageMemberData,
} from '../../../src/models/municipality/VillageMemberDataModel';

const validMember = {
  userId: 'u-1',
  role: 'user' as const,
  joinedAt: new Date('2026-01-01T00:00:00Z'),
  profileAnswers: {},
  profileCompletedAt: null,
};

describe('VillageMemberDataSchema', () => {
  it('parses a valid member', () => {
    expect(() => VillageMemberDataSchema.parse(validMember)).not.toThrow();
  });

  it('rejects an unknown role', () => {
    expect(() =>
      VillageMemberDataSchema.parse({ ...validMember, role: 'moderator' }),
    ).toThrow();
  });

  // Census answers are private and live in censoAnswers/; a member doc that
  // still carries them must fail loudly rather than be read as public data.
  it('rejects census answers on the member doc', () => {
    expect(() =>
      VillageMemberDataSchema.parse({ ...validMember, profileAnswers: { barrio: 'Centro' } }),
    ).toThrow();
  });

  it('strips a stray barrioId (residence lives on the person, not the member)', () => {
    const parsed = VillageMemberDataSchema.parse({ ...validMember, barrioId: 'centro' });
    expect(parsed).not.toHaveProperty('barrioId');
  });
});

describe('buildVillageMemberData', () => {
  it('fills defaults and round-trips through the schema', () => {
    const m = buildVillageMemberData({ userId: 'u-1' });
    expect(m.userId).toBe('u-1');
    expect(m.role).toBe('user');
    expect(m.profileAnswers).toEqual({});
    expect(m.profileCompletedAt).toBeNull();
    expect(m).not.toHaveProperty('barrioId');
    expect(() => VillageMemberDataSchema.parse(m)).not.toThrow();
  });

  it('preserves provided fields', () => {
    const t = new Date('2026-05-01T00:00:00Z');
    const m = buildVillageMemberData({
      userId: 'u-1',
      role: 'admin',
      joinedAt: t,
      profileCompletedAt: t,
    });
    expect(m.role).toBe('admin');
    expect(() => VillageMemberDataSchema.parse(m)).not.toThrow();
  });
});

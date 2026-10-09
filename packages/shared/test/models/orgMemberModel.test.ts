import { describe, it, expect } from 'vitest';
import {
  OrgMemberDataSchema,
  buildOrgMemberData,
  isSoleAdminWithOthers,
} from '../../src/models/organization/OrgMemberDataModel';

describe('OrgMemberDataModel', () => {
  it('defaults role to "member"', () => {
    const m = buildOrgMemberData({ userId: 'u-1' });
    expect(m.role).toBe('member');
  });

  it('accepts an explicit admin role', () => {
    expect(buildOrgMemberData({ userId: 'u-1', role: 'admin' }).role).toBe('admin');
  });

  it('requires role on the persisted shape', () => {
    expect(() =>
      OrgMemberDataSchema.parse({ userId: 'u-1', joinedAt: new Date() }),
    ).toThrow();
  });

  it('rejects an unknown role', () => {
    expect(() =>
      OrgMemberDataSchema.parse({ userId: 'u-1', joinedAt: new Date(), role: 'owner' }),
    ).toThrow();
  });

  it('requires userId on the persisted shape', () => {
    expect(() =>
      OrgMemberDataSchema.parse({ joinedAt: new Date(), role: 'member' }),
    ).toThrow();
  });

  it('sets userId == the member doc id via buildOrgMemberData, round-tripping through the schema', () => {
    const m = buildOrgMemberData({ userId: 'u-1' });
    expect(m.userId).toBe('u-1');
    expect(() => OrgMemberDataSchema.parse(m)).not.toThrow();
  });
});

describe('isSoleAdminWithOthers', () => {
  const admin = (userId: string) => ({ userId, role: 'admin' as const });
  const member = (userId: string) => ({ userId, role: 'member' as const });

  it('holds back the only admin while other members remain', () => {
    expect(isSoleAdminWithOthers([admin('a'), member('b')], 'a')).toBe(true);
  });

  it('lets an admin leave when another admin remains', () => {
    expect(isSoleAdminWithOthers([admin('a'), admin('b'), member('c')], 'a')).toBe(false);
  });

  it('lets the sole member leave, admin or not', () => {
    expect(isSoleAdminWithOthers([admin('a')], 'a')).toBe(false);
  });

  it('never holds back a plain member', () => {
    expect(isSoleAdminWithOthers([admin('a'), member('b')], 'b')).toBe(false);
  });
});

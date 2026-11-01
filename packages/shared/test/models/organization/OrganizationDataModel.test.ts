import { describe, it, expect } from 'vitest';
import {
  OrganizationDataSchema,
  buildOrganizationData,
  canViewOrgRoster,
} from '../../../src/models/organization/OrganizationDataModel';

const validOrg = {
  name: 'Peña X',
  description: null,
  images: [] as string[],
  type: 'peña' as const,
  status: 'pending' as const,
  municipalityId: 'm-1', villageSlug: 'villa',
  requestedBy: 'u-1',
  reviewedBy: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  reviewedAt: null,
  commentCount: 0,
  readCount: 0,
  memberCount: 0,
  membersPublic: true,
};

describe('OrganizationDataSchema', () => {
  it('parses a complete valid organization', () => {
    expect(() => OrganizationDataSchema.parse(validOrg)).not.toThrow();
  });

  it('rejects a missing required field', () => {
    const { name: _name, ...rest } = validOrg;
    expect(() => OrganizationDataSchema.parse(rest)).toThrow();
  });

  it('rejects an unknown status value', () => {
    expect(() => OrganizationDataSchema.parse({ ...validOrg, status: 'archived' })).toThrow();
  });

  it('parses a comisión de festejos', () => {
    expect(OrganizationDataSchema.parse({ ...validOrg, type: 'comisión' }).type).toBe('comisión');
  });

  // An installed binary must not blank a village's group list over a type added after it.
  it('reads a type it does not know as otros', () => {
    expect(OrganizationDataSchema.parse({ ...validOrg, type: 'cofradía' }).type).toBe('otros');
  });

  it('requires images on the persisted shape', () => {
    const { images: _omit, ...rest } = validOrg;
    expect(() => OrganizationDataSchema.parse(rest)).toThrow();
  });

  it('rejects more than 5 images at the schema boundary', () => {
    expect(() =>
      OrganizationDataSchema.parse({ ...validOrg, images: ['1', '2', '3', '4', '5', '6'] }),
    ).toThrow();
  });
});

describe('buildOrganizationData', () => {
  it('defaults status pending and decision fields null', () => {
    const o = buildOrganizationData({
      name: 'Peña X',
      type: 'peña',
      requestedBy: 'u1',
      municipalityId: 'v1', villageSlug: 'villa',
    });
    expect(o.name).toBe('Peña X');
    expect(o.municipalityId).toBe('v1');
    expect(o.status).toBe('pending');
    expect(o.description).toBeNull();
    expect(o.images).toEqual([]);
    expect(o.reviewedBy).toBeNull();
    expect(o.reviewedAt).toBeNull();
    expect(o.createdAt).toBeInstanceOf(Date);
    expect(o.readCount).toBe(0);
    expect(o.commentCount).toBe(0);
    expect(o.memberCount).toBe(0);
    expect('reactionCounts' in o).toBe(false);
    expect(() => OrganizationDataSchema.parse(o)).not.toThrow();
  });
});

describe('membersPublic', () => {
  it('rejects an org missing membersPublic', () => {
    const { membersPublic: _omit, ...rest } = validOrg;
    expect(() => OrganizationDataSchema.parse(rest)).toThrow();
  });

  it('buildOrganizationData defaults membersPublic to true', () => {
    const o = buildOrganizationData({
      name: 'Peña X', type: 'peña', requestedBy: 'u1', municipalityId: 'v1', villageSlug: 'villa',
    });
    expect(o.membersPublic).toBe(true);
    expect(() => OrganizationDataSchema.parse(o)).not.toThrow();
  });

  it('buildOrganizationData honours an explicit membersPublic false', () => {
    const o = buildOrganizationData({
      name: 'Peña X', type: 'peña', requestedBy: 'u1', municipalityId: 'v1', villageSlug: 'villa', membersPublic: false,
    });
    expect(o.membersPublic).toBe(false);
  });
});

describe('canViewOrgRoster', () => {
  it('public group: anyone sees the roster', () => {
    expect(canViewOrgRoster({ membersPublic: true, isMember: false })).toBe(true);
    expect(canViewOrgRoster({ membersPublic: true, isMember: true })).toBe(true);
  });
  it('private group: only members see the roster', () => {
    expect(canViewOrgRoster({ membersPublic: false, isMember: true })).toBe(true);
    expect(canViewOrgRoster({ membersPublic: false, isMember: false })).toBe(false);
  });
});

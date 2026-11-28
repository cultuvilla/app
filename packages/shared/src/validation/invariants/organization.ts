import { orphanInvariant, parentPathOf, referenceInvariant } from '../factories';
import { docsOf, type Invariant, type Violation } from '../types';

export const organizationMunicipalityExists = referenceInvariant({
  id: 'organizations.municipalityId.exists',
  description: 'Every organization belongs to an existing municipality',
  collection: 'organizations',
  targets: ['municipalities'],
  refs: (doc) => [{ field: 'municipalityId', value: doc.data['municipalityId'], target: 'municipalities' }],
});

export const orgMemberParentExists = orphanInvariant('organizationMembers');
export const orgJoinRequestParentExists = orphanInvariant('organizationJoinRequests');
export const orgPresenceRequestParentExists = orphanInvariant('organizationPresenceRequests');

/** A group is listed only in existing pueblos (removing a pueblo's community does not reach its visitors). */
export const organizationPresenceMunicipalitiesExist = referenceInvariant({
  id: 'organizations.municipalityIds.exists',
  description: 'Every pueblo a group is present in exists',
  collection: 'organizations',
  targets: ['municipalities'],
  refs: (doc) => {
    const ids = doc.data['municipalityIds'];
    return (Array.isArray(ids) ? ids : []).map((value: unknown) => ({
      field: 'municipalityIds',
      value,
      target: 'municipalities' as const,
    }));
  },
});

/**
 * An approved group is listed in its pueblo only through `municipalityIds`, so
 * one that leaves its home out of it has vanished from its own pueblo's list.
 */
export const approvedOrgListsItsHome: Invariant = {
  id: 'organizations.municipalityIds.includesHome',
  description: 'Every approved organization is listed in its home pueblo',
  reads: ['organizations'],
  check: (snap) => {
    const id = 'organizations.municipalityIds.includesHome';
    const out: Violation[] = [];
    for (const org of docsOf(snap, 'organizations').values()) {
      if (org.data['status'] !== 'approved') continue;
      const ids = org.data['municipalityIds'];
      if (Array.isArray(ids) && ids.includes(org.data['municipalityId'])) continue;
      out.push({
        invariant: id,
        path: org.path,
        field: 'municipalityIds',
        message: `${org.path} is approved and is not listed in its home pueblo`,
      });
    }
    return out;
  },
};
export const orgSocioParentExists = orphanInvariant('organizationSocios');

export const orgMemberUserExists = referenceInvariant({
  id: 'organizationMembers.userId.exists',
  description: 'Every integrante is an existing account (deleteAccount removes its memberships)',
  collection: 'organizationMembers',
  targets: ['users'],
  refs: (doc) => [{ field: 'userId', value: doc.data['userId'], target: 'users' }],
});

/**
 * An approved group with no admin integrante cannot be managed by anyone but
 * the village admins: nobody can accept a join request, post an aviso or
 * promote a new admin. Approval seeds the founder as admin, so an adminless
 * group means a membership was removed without the role moving on.
 */
export const approvedOrgHasAdmin: Invariant = {
  id: 'organizations.approved.hasAdmin',
  description: 'Every approved organization has at least one admin integrante',
  reads: ['organizations', 'organizationMembers'],
  check: (snap) => {
    const id = 'organizations.approved.hasAdmin';
    const withAdmin = new Set<string>();
    for (const member of docsOf(snap, 'organizationMembers').values()) {
      if (member.data['role'] === 'admin') withAdmin.add(parentPathOf(member));
    }
    const out: Violation[] = [];
    for (const org of docsOf(snap, 'organizations').values()) {
      if (org.data['status'] !== 'approved' || withAdmin.has(org.path)) continue;
      out.push({ invariant: id, path: org.path, message: `${org.path} is approved and has no admin integrante` });
    }
    return out;
  },
};

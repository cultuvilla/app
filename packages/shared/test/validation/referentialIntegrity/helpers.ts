import { buildSnapshot, collectionsFor, registry, runInvariants, type DataSnapshot, type Invariant } from '../../../src/validation';

/** A snapshot from `path → data`, placed against every collection the registry reads. */
export function snapshotOf(docs: Record<string, Record<string, unknown>>): DataSnapshot {
  return buildSnapshot(
    Object.entries(docs).map(([path, data]) => ({ path, data })),
    collectionsFor(registry),
  );
}

/** Violations of one invariant, as `path` (or `path field`) strings. */
export function hits(invariant: Invariant, docs: Record<string, Record<string, unknown>>): string[] {
  return runInvariants(snapshotOf(docs), [invariant]).map((v) => (v.field ? `${v.path} ${v.field}` : v.path));
}

/** A consistent little village: every invariant in the registry holds on it. */
export function healthyVillage(): Record<string, Record<string, unknown>> {
  return {
    'municipalities/m1': { slug: 'aranjuez', name: 'Aranjuez', peopleCount: 2, community: { organizerId: 'u1' } },
    'municipalities/m1/members/u1': { userId: 'u1', role: 'admin' },
    'municipalities/m1/members/u2': { userId: 'u2', role: 'user' },
    'municipalities/m1/barrios/b1': { municipalityId: 'm1', residentCount: 1, commentCount: 0 },
    'municipalities/m1/places/cem': { municipalityId: 'm1', burialCount: 1, commentCount: 0 },
    'users/u1': {},
    'users/u2': {},
    'persons/p1': { userId: 'u1', municipalityLinks: [{ municipalityId: 'm1', barrioId: 'b1' }], deathDate: null, burialPlace: null },
    'persons/p2': { userId: 'u2', municipalityLinks: [{ municipalityId: 'm1', barrioId: null }], deathDate: null, burialPlace: null },
    'persons/dead': { userId: null, municipalityLinks: [{ municipalityId: 'm1', barrioId: 'b1' }], deathDate: { year: 1950, month: null, day: null }, burialPlace: { municipalityId: 'm1', placeId: 'cem' } },
    'municipalityPeople/m1_p1': { municipalityId: 'm1', personId: 'p1', barrioId: 'b1' },
    'municipalityPeople/m1_p2': { municipalityId: 'm1', personId: 'p2', barrioId: null },
    'organizations/o1': { municipalityId: 'm1', villageSlug: 'aranjuez', status: 'approved', memberCount: 2, commentCount: 1 },
    'organizations/o1/members/u1': { userId: 'u1', role: 'admin' },
    'organizations/o1/members/u2': { userId: 'u2', role: 'member' },
    'events/e1': {
      municipalityId: 'm1', villageSlug: 'aranjuez', villageName: 'Aranjuez',
      organizerOrgIds: ['o1'], visibilityOrgId: null, fiestaEditionId: null,
      confirmedCount: 1, totalCount: 2, commentCount: 0,
    },
    'events/e1/registrations/r1': { personId: 'p1', status: 'confirmed' },
    'events/e1/registrations/r2': { personId: '', status: 'waitlisted' },
    'news/n1': { municipalityId: 'm1', villageSlug: 'aranjuez', organizerOrgIds: ['o1'], commentCount: 0 },
    'comments/c1': { entityKind: 'organization', entityId: 'o1', municipalityId: 'm1', parentCommentId: null, replyCount: 0 },
  };
}

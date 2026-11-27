import { describe, expect, it } from 'vitest';
import { COLLECTIONS } from '../../../src/firebase/refs/collections';
import { collectionsFor, registry, runInvariants } from '../../../src/validation';
import * as village from '../../../src/validation/invariants/village';
import * as organization from '../../../src/validation/invariants/organization';
import * as person from '../../../src/validation/invariants/person';
import * as event from '../../../src/validation/invariants/event';
import * as denormalized from '../../../src/validation/invariants/denormalized';
import * as account from '../../../src/validation/invariants/account';
import { ENTITY_KINDS } from '../../../src/models/interaction/EntityKind';
import { healthyVillage, hits, snapshotOf } from './helpers';

const without = (docs: Record<string, Record<string, unknown>>, ...paths: string[]) =>
  Object.fromEntries(Object.entries(docs).filter(([path]) => !paths.includes(path)));
const patch = (docs: Record<string, Record<string, unknown>>, path: string, data: Record<string, unknown>) => ({
  ...docs,
  [path]: { ...docs[path], ...data },
});

describe('registry', () => {
  it('passes on a consistent village', () => {
    expect(runInvariants(snapshotOf(healthyVillage()))).toEqual([]);
  });

  it('has unique ids', () => {
    const ids = registry.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reads only declared collections, so a renamed one cannot silently read as empty', () => {
    for (const key of collectionsFor(registry)) expect(COLLECTIONS[key]).toBeDefined();
  });

  it('flags every reference when the data it points at is gone', () => {
    expect(runInvariants(snapshotOf({ 'events/e1/registrations/r1': { personId: 'p9', status: 'confirmed' } })).map((v) => v.invariant)).toEqual(
      expect.arrayContaining(['eventRegistrations.parent.exists', 'eventRegistrations.personId.exists']),
    );
  });
});

describe('village', () => {
  it('finds members, barrios and places under a deleted municipality', () => {
    const docs = without(healthyVillage(), 'municipalities/m1');
    expect(hits(village.villageMemberParentExists, docs)).toEqual(['municipalities/m1/members/u1', 'municipalities/m1/members/u2']);
    expect(hits(village.barrioParentExists, docs)).toEqual(['municipalities/m1/barrios/b1']);
    expect(hits(village.placeParentExists, docs)).toEqual(['municipalities/m1/places/cem']);
  });

  it('finds a village member whose account is gone', () => {
    expect(hits(village.villageMemberUserExists, without(healthyVillage(), 'users/u2'))).toEqual(['municipalities/m1/members/u2 userId']);
  });

  it('requires the Embajador to be an admin member', () => {
    const docs = healthyVillage();
    expect(hits(village.villageAmbassadorIsAdmin, patch(docs, 'municipalities/m1', { community: { organizerId: 'u2' } }))).toEqual(['municipalities/m1 community.organizerId']);
    expect(hits(village.villageAmbassadorIsAdmin, without(docs, 'municipalities/m1/members/u1'))).toEqual(['municipalities/m1 community.organizerId']);
    expect(hits(village.villageAmbassadorIsAdmin, patch(docs, 'municipalities/m1', { community: { organizerId: null } }))).toEqual([]);
    expect(hits(village.villageAmbassadorIsAdmin, patch(docs, 'municipalities/m1', { community: null }))).toEqual([]);
  });

  it('flags a barrio whose municipalityId disagrees with its path', () => {
    expect(hits(village.barrioMunicipalityIdMatches, patch(healthyVillage(), 'municipalities/m1/barrios/b1', { municipalityId: 'm2' }))).toEqual(['municipalities/m1/barrios/b1 municipalityId']);
  });
});

describe('organization', () => {
  it('finds a group in a municipality that does not exist', () => {
    expect(hits(organization.organizationMunicipalityExists, without(healthyVillage(), 'municipalities/m1'))).toEqual(['organizations/o1 municipalityId']);
  });

  it('finds integrantes of a deleted group and integrantes with no account', () => {
    expect(hits(organization.orgMemberParentExists, without(healthyVillage(), 'organizations/o1'))).toHaveLength(2);
    expect(hits(organization.orgMemberUserExists, without(healthyVillage(), 'users/u1'))).toEqual(['organizations/o1/members/u1 userId']);
  });

  it('flags an approved group with no admin, and ignores a pending one', () => {
    const adminless = patch(healthyVillage(), 'organizations/o1/members/u1', { role: 'member' });
    expect(hits(organization.approvedOrgHasAdmin, adminless)).toEqual(['organizations/o1']);
    expect(hits(organization.approvedOrgHasAdmin, patch(adminless, 'organizations/o1', { status: 'pending' }))).toEqual([]);
  });
});

describe('person', () => {
  it('finds links to a deleted municipality or barrio', () => {
    const docs = patch(healthyVillage(), 'persons/p1', { municipalityLinks: [{ municipalityId: 'm9', barrioId: null }, { municipalityId: 'm1', barrioId: 'b9' }] });
    expect(hits(person.personMunicipalityExists, docs)).toEqual(['persons/p1 municipalityLinks.municipalityId']);
    expect(hits(person.personBarrioExists, docs)).toEqual(['persons/p1 municipalityLinks.barrioId']);
  });

  it('checks an account link only when there is one', () => {
    expect(hits(person.personUserExists, without(healthyVillage(), 'users/u1'))).toEqual(['persons/p1 userId']);
  });

  it('finds a burial place that does not exist', () => {
    expect(hits(person.personBurialPlaceExists, without(healthyVillage(), 'municipalities/m1/places/cem'))).toEqual(['persons/dead burialPlace.placeId']);
  });

  it('checks the roster projection both ways, and the barrio it carries', () => {
    const docs = healthyVillage();
    expect(hits(person.municipalityPeopleMatchesPersons, without(docs, 'municipalityPeople/m1_p2'))).toEqual(['municipalityPeople/m1_p2']);
    expect(hits(person.municipalityPeopleMatchesPersons, without(docs, 'persons/p2'))).toEqual(['municipalityPeople/m1_p2']);
    expect(hits(person.municipalityPeopleMatchesPersons, patch(docs, 'municipalityPeople/m1_p1', { barrioId: null }))).toEqual(['municipalityPeople/m1_p1 barrioId']);
    // The deceased persona belongs to the cemetery, not the roster.
    expect(hits(person.municipalityPeopleMatchesPersons, { ...docs, 'municipalityPeople/m1_dead': { municipalityId: 'm1' } })).toEqual(['municipalityPeople/m1_dead']);
  });

  it('takes the first barrio-naming link, as the projection trigger does', () => {
    const docs = patch(healthyVillage(), 'persons/p1', { municipalityLinks: [{ municipalityId: 'm1', barrioId: null }, { municipalityId: 'm1', barrioId: 'b1' }] });
    expect(hits(person.municipalityPeopleMatchesPersons, docs)).toEqual([]);
  });
});

describe('event and news', () => {
  it('finds events and news in a deleted municipality or by a deleted group', () => {
    const noVillage = without(healthyVillage(), 'municipalities/m1');
    expect(hits(event.eventMunicipalityExists, noVillage)).toEqual(['events/e1 municipalityId']);
    expect(hits(event.newsMunicipalityExists, noVillage)).toEqual(['news/n1 municipalityId']);
    const noOrg = without(healthyVillage(), 'organizations/o1');
    expect(hits(event.eventOrganizerOrgsExist, noOrg)).toEqual(['events/e1 organizerOrgIds']);
    expect(hits(event.newsOrganizerOrgsExist, noOrg)).toEqual(['news/n1 organizerOrgIds']);
  });

  it('checks optional references only when set', () => {
    const docs = patch(healthyVillage(), 'events/e1', { visibilityOrgId: 'o9', fiestaEditionId: 'f9' });
    expect(hits(event.eventVisibilityOrgExists, docs)).toEqual(['events/e1 visibilityOrgId']);
    expect(hits(event.eventFiestaEditionExists, docs)).toEqual(['events/e1 fiestaEditionId']);
  });

  it('finds registrations of a deleted event or person, and skips walk-ins', () => {
    expect(hits(event.registrationParentExists, without(healthyVillage(), 'events/e1'))).toHaveLength(2);
    expect(hits(event.registrationPersonExists, without(healthyVillage(), 'persons/p1'))).toEqual(['events/e1/registrations/r1 personId']);
  });
});

describe('denormalized counts', () => {
  it('flags each counter that disagrees with its source', () => {
    const docs = healthyVillage();
    const cases: [typeof denormalized.villagePeopleCountMatches, string, Record<string, unknown>][] = [
      [denormalized.villagePeopleCountMatches, 'municipalities/m1', { peopleCount: 3 }],
      [denormalized.orgMemberCountMatches, 'organizations/o1', { memberCount: 1 }],
      [denormalized.barrioResidentCountMatches, 'municipalities/m1/barrios/b1', { residentCount: 2 }],
      [denormalized.placeBurialCountMatches, 'municipalities/m1/places/cem', { burialCount: 0 }],
      [denormalized.eventConfirmedCountMatches, 'events/e1', { confirmedCount: 2 }],
      [denormalized.eventTotalCountMatches, 'events/e1', { totalCount: 1 }],
      [denormalized.replyCountMatches, 'comments/c1', { replyCount: 4 }],
    ];
    for (const [invariant, path, data] of cases) {
      expect(hits(invariant, patch(docs, path, data)), invariant.id).toHaveLength(1);
    }
  });

  it('reports the stored and the expected value', () => {
    const [violation] = runInvariants(snapshotOf(patch(healthyVillage(), 'organizations/o1', { memberCount: 7 })), [denormalized.orgMemberCountMatches]);
    expect(violation).toMatchObject({ path: 'organizations/o1', value: '7', expected: '2' });
  });

  it('leaves an absent counter to the conformance gate', () => {
    expect(hits(denormalized.villagePeopleCountMatches, patch(healthyVillage(), 'municipalities/m1', { peopleCount: undefined }))).toEqual([]);
  });

  it('does not count a deceased persona as a resident', () => {
    // persons/dead links b1 too; residentCount 1 is p1 alone.
    expect(hits(denormalized.barrioResidentCountMatches, healthyVillage())).toEqual([]);
  });

  it('counts a comment toward its entity, a place or barrio under its municipality', () => {
    const docs = {
      ...healthyVillage(),
      'comments/c2': { entityKind: 'place', entityId: 'cem', municipalityId: 'm1', parentCommentId: null, replyCount: 0 },
    };
    const placeCount = denormalized.commentCountInvariants.find((i) => i.id === 'municipalityPlaces.commentCount.matches');
    expect(placeCount).toBeDefined();
    if (placeCount) expect(hits(placeCount, docs)).toEqual(['municipalities/m1/places/cem commentCount']);
  });

  it('routes every comment-capable kind', () => {
    expect(Object.keys(denormalized.COMMENT_TARGETS).sort()).toEqual([...ENTITY_KINDS].sort());
  });

  it('finds comments on a deleted entity and replies to a deleted comment', () => {
    const docs = {
      ...without(healthyVillage(), 'organizations/o1'),
      'comments/c3': { entityKind: 'news', entityId: 'n1', municipalityId: 'm1', parentCommentId: 'c9', replyCount: 0 },
    };
    expect(hits(denormalized.commentEntityExists, docs)).toEqual(['comments/c1 entityId']);
    expect(hits(denormalized.commentParentExists, docs)).toEqual(['comments/c3 parentCommentId']);
  });

  it('flags a stale villageSlug or villageName copy', () => {
    const docs = patch(healthyVillage(), 'municipalities/m1', { slug: 'aranjuez-2', name: 'Aranjuez de Tajo' });
    const found = runInvariants(snapshotOf(docs), denormalized.copiedVillageFieldInvariants).map((v) => v.invariant);
    expect(found.sort()).toEqual(['events.villageName.matches', 'events.villageSlug.matches', 'news.villageSlug.matches', 'organizations.villageSlug.matches']);
  });
});

describe('account leftovers', () => {
  const byId = (id: string) => {
    const found = account.accountLeftoverInvariants.find((i) => i.id === id);
    if (!found) throw new Error(`no invariant ${id}`);
    return found;
  };

  it('finds a registration private half whose registration is gone', () => {
    const docs = {
      ...healthyVillage(),
      'events/e1/registrationPrivate/r1': { phone: '600' },
      'events/e1/registrationPrivate/gone': { phone: '600' },
    };
    expect(hits(account.registrationPrivateHasRegistration, docs)).toEqual(['events/e1/registrationPrivate/gone']);
  });

  it('finds an admin grant and a block list of an erased account', () => {
    const docs = { ...healthyVillage(), 'admins/u1': {}, 'admins/gone': {}, 'users/gone/blockedUsers/u1': { blockedUserId: 'u1' } };
    expect(hits(account.adminGrantHasAccount, docs)).toEqual(['admins/gone id']);
    expect(hits(account.blockedUsersParentExists, docs)).toEqual(['users/gone/blockedUsers/u1']);
  });

  it('finds an erased author or contributor and accepts the erasure sentinel', () => {
    const docs = {
      ...healthyVillage(),
      'municipalities/m1/places/p1': { municipalityId: 'm1', proposedBy: 'gone', contributorUserIds: ['u1', 'gone2'] },
      'municipalities/m1/places/p2': { municipalityId: 'm1', proposedBy: 'deleted-user', contributorUserIds: [] },
    };
    expect(hits(byId('municipalityPlaces.proposedBy+contributorUserIds.account.exists'), docs)).toEqual([
      'municipalities/m1/places/p1 proposedBy',
      'municipalities/m1/places/p1 contributorUserIds',
    ]);
  });

  it('reads a nested uid: a quote of an erased author', () => {
    const docs = { ...healthyVillage(), 'organizations/o1/chat/c1': { authorUid: 'u1', replyTo: { authorUid: 'gone' } } };
    expect(hits(byId('organizationGeneralChat.replyTo.authorUid.account.exists'), docs)).toEqual(['organizations/o1/chat/c1 replyTo.authorUid']);
  });
});

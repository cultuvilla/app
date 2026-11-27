import type { CollectionKey } from '../firebase/refs/collections';
import type { DataSnapshot, Invariant, Violation } from './types';
import * as village from './invariants/village';
import * as organization from './invariants/organization';
import * as person from './invariants/person';
import * as event from './invariants/event';
import * as denormalized from './invariants/denormalized';

/** Every invariant the audit runs. A new check is a function in `invariants/` and one line here. */
export const registry: readonly Invariant[] = [
  // Village
  village.villageMemberParentExists,
  village.barrioParentExists,
  village.placeParentExists,
  village.villageMemberUserExists,
  village.villageAmbassadorIsAdmin,
  village.barrioMunicipalityIdMatches,
  village.placeMunicipalityIdMatches,
  // Organization and integrantes
  organization.organizationMunicipalityExists,
  organization.orgMemberParentExists,
  organization.orgJoinRequestParentExists,
  organization.orgSocioParentExists,
  organization.orgMemberUserExists,
  organization.approvedOrgHasAdmin,
  // Person
  person.personMunicipalityExists,
  person.personBarrioExists,
  person.personUserExists,
  person.personBurialPlaceExists,
  person.municipalityPeopleMatchesPersons,
  // Event and news
  event.eventMunicipalityExists,
  event.eventOrganizerOrgsExist,
  event.eventVisibilityOrgExists,
  event.eventFiestaEditionExists,
  event.registrationParentExists,
  event.registrationPersonExists,
  event.newsMunicipalityExists,
  event.newsOrganizerOrgsExist,
  // Denormalized counts and copies
  denormalized.villagePeopleCountMatches,
  denormalized.orgMemberCountMatches,
  denormalized.barrioResidentCountMatches,
  denormalized.placeBurialCountMatches,
  denormalized.eventConfirmedCountMatches,
  denormalized.eventTotalCountMatches,
  denormalized.commentEntityExists,
  denormalized.commentParentExists,
  ...denormalized.commentCountInvariants,
  denormalized.replyCountMatches,
  ...denormalized.copiedVillageFieldInvariants,
];

/** Apply each invariant in order. Pure: loading the snapshot is the caller's job. */
export function runInvariants(snap: DataSnapshot, invariants: readonly Invariant[] = registry): Violation[] {
  return invariants.flatMap((invariant) => invariant.check(snap));
}

/** The union of collections the given invariants read, so a loader fetches each once. */
export function collectionsFor(invariants: readonly Invariant[]): CollectionKey[] {
  return [...new Set(invariants.flatMap((invariant) => invariant.reads))].sort();
}

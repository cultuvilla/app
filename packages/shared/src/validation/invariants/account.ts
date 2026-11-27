// What an erased account must not leave behind. Each check names a place the
// deleteAccount uid cascade now cleans (functions/src/account/cascade/), so a
// finding is a leftover from an account deleted before that cascade covered it —
// or a new path the cascade missed.
import type { CollectionKey } from '../../firebase/refs/collections';
import { DELETED_USER_UID } from '../../models/user/deletedUser';
import { orphanInvariant, referenceInvariant, type Ref } from '../factories';
import { docsOf, type Invariant, type SnapshotDoc, type Violation } from '../types';

/** A uid field, or each uid of a uid list, that must name an existing account; the erasure sentinel is fine. */
function userRefs(doc: SnapshotDoc, fields: readonly string[], lists: readonly string[] = []): Ref[] {
  const refs: Ref[] = [];
  const read = (field: string): unknown => field.split('.').reduce<unknown>(
    (value, key) => (value !== null && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined),
    doc.data,
  );
  for (const field of fields) {
    const value = read(field);
    if (value !== DELETED_USER_UID) refs.push({ field, value, target: 'users', optional: true });
  }
  for (const field of lists) {
    const value = read(field);
    if (!Array.isArray(value)) continue;
    for (const uid of value) if (uid !== DELETED_USER_UID) refs.push({ field, value: uid, target: 'users' });
  }
  return refs;
}

function accountRefs(collection: CollectionKey, fields: readonly string[], lists: readonly string[] = []): Invariant {
  return referenceInvariant({
    id: `${collection}.${[...fields, ...lists].join('+')}.account.exists`,
    description: `${[...fields, ...lists].join(', ')} on ${collection} name an existing account (or the erasure sentinel)`,
    collection,
    targets: ['users'],
    refs: (doc) => userRefs(doc, fields, lists),
  });
}

const REGISTRATION_PRIVATE_ID = 'eventRegistrationPrivate.registration.exists';

/** A registration's private half (phone, birth date, signup answers) must not outlive the registration. */
export const registrationPrivateHasRegistration: Invariant = {
  id: REGISTRATION_PRIVATE_ID,
  description: 'Every events/{eventId}/registrationPrivate doc has its registration',
  reads: ['eventRegistrationPrivate', 'eventRegistrations'],
  check: (snap) => {
    const out: Violation[] = [];
    const registrations = docsOf(snap, 'eventRegistrations');
    for (const doc of docsOf(snap, 'eventRegistrationPrivate').values()) {
      const registration = doc.path.replace('/registrationPrivate/', '/registrations/');
      if (!registrations.has(registration)) {
        out.push({ invariant: REGISTRATION_PRIVATE_ID, path: doc.path, value: registration, message: `${doc.path} -> missing ${registration}` });
      }
    }
    return out;
  },
};

export const adminGrantHasAccount = referenceInvariant({
  id: 'admins.id.account.exists',
  description: 'An app admin grant belongs to an existing account',
  collection: 'admins',
  targets: ['users'],
  refs: (doc) => [{ field: 'id', value: doc.id, target: 'users' }],
});

export const blockedUsersParentExists = orphanInvariant('userBlockedUsers');

export const accountLeftoverInvariants: readonly Invariant[] = [
  registrationPrivateHasRegistration,
  adminGrantHasAccount,
  blockedUsersParentExists,
  accountRefs('eventRegistrations', ['personUserId']),
  accountRefs('eventSeatTokens', ['createdBy']),
  accountRefs('organizationJoinRequests', ['userId']),
  accountRefs('censoAnswers', ['userId']),
  accountRefs('municipalityPlaces', ['proposedBy'], ['contributorUserIds']),
  accountRefs('municipalityBarrios', ['proposedBy']),
  accountRefs('festivalPosters', ['proposedBy'], ['contributorUserIds']),
  accountRefs('fiestaEditions', ['proposedBy']),
  accountRefs('vocabularyTerms', ['createdBy'], ['contributorUserIds']),
  accountRefs('vocabularyDefinitions', ['createdBy'], ['contributorUserIds']),
  accountRefs('historyEntries', ['createdBy']),
  accountRefs('persons', ['createdBy']),
  accountRefs('cosas', ['createdBy']),
  accountRefs('organizationGeneralChat', ['replyTo.authorUid']),
  accountRefs('organizationAvisoChat', ['replyTo.authorUid']),
  accountRefs('organizationTaskComments', ['replyTo.authorUid']),
  accountRefs('cosaRequestChat', ['replyTo.authorUid']),
];

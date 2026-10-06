import { getPersonByUserId } from '@cultuvilla/shared/services/personService';
import { getPublicProfile } from '@cultuvilla/shared/services/userService';
import { buildDisplayName } from '@cultuvilla/shared/models/person/PersonDataModel';
import { DELETED_USER_UID } from '@cultuvilla/shared/models/user';
import { withFirestoreErrorLog } from '../firestoreErrorLog';

/** Resolved author metadata, keyed by uid (name + optional profile photo). */
export type CommentAuthor = { name: string; photoURL: string | null };

export type CommentAuthorLabels = {
  /** Shown for a comment whose account has since been deleted. */
  deleted: string;
  /** Last resort, only when neither source yields a name. */
  fallback: string;
};

/**
 * Resolves one comment author's name + avatar, and **never rejects**.
 *
 * The two sources fail independently, so they are awaited independently:
 *
 * - `persons` is reached through a *query* (`userId == uid`), and the persons
 *   read rule is evaluated per matched document. A single private persona
 *   matching that query denies the whole query — for the viewer, not for the
 *   author — so this lookup returning nothing says nothing about whether a name
 *   exists.
 * - `publicProfiles/{uid}` is world-readable and carries `displayName`,
 *   projected from the same person doc (via `users/{uid}`, which is owner-only
 *   since it holds contact fields). That is the dependable
 *   name source; the person lookup only adds the avatar and the freshest name.
 *
 * Letting either failure escape used to cost the *whole batch* its names (one
 * `Promise.all` over every uid on screen), which is how a single unreadable
 * persona turned every commenter into "Usuario".
 */
export async function resolveCommentAuthor(
  uid: string,
  labels: CommentAuthorLabels,
): Promise<CommentAuthor> {
  if (uid === DELETED_USER_UID) return { name: labels.deleted, photoURL: null };

  const [person, profile] = await Promise.all([
    withFirestoreErrorLog('comments:getPersonByUserId', () => getPersonByUserId(uid)).catch(
      () => null,
    ),
    withFirestoreErrorLog('comments:getPublicProfile', () => getPublicProfile(uid)).catch(() => null),
  ]);

  // A person whose name fields are all blank must not win over the projection —
  // `buildDisplayName` joins what it is given, so it can legitimately return ''.
  const personName = person ? buildDisplayName(person).trim() : '';
  const profileName = profile?.displayName?.trim() ?? '';

  return {
    name: personName || profileName || labels.fallback,
    photoURL: person?.photoURL ?? null,
  };
}

import {
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  limit,
} from '../firebase/sdk/firestore';
import { getDb } from '../firebase';
import { personsCollection, personDoc } from '../firebase/refs/client';
import {
  buildPersonData,
  buildDisplayName,
  buildResidenceLinks,
  type PersonData,
  type PersonDataInput,
} from '../models/person';

export async function getPerson(personId: string): Promise<(PersonData & { id: string }) | null> {
  const snap = await getDoc(personDoc(getDb(), personId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/**
 * Every persona a user created — their own account persona plus the dependents
 * they registered.
 *
 * Same rules constraint as {@link getPersonByUserId}: `createdBy ==` on its own
 * proves nothing about `isPublic` and nothing about the caller, so the query is
 * rejected outright for anyone but the creator — whether or not that user
 * actually has a private persona. Unpinned, it made the read-only /user/[uid]
 * profile come up blank: the denial rejected the batch that also carried the
 * persona and event reads, so the photo, the name and every stat stayed empty.
 *
 * Pass `viewerUid` when the caller is asking about their own personas (the only
 * way to see the private ones); omitting it yields the public-only view.
 */
export async function getPersonsByCreator(
  userId: string,
  viewerUid?: string | null,
): Promise<(PersonData & { id: string })[]> {
  const own = viewerUid != null && viewerUid === userId;
  const q = own
    ? query(
        personsCollection(getDb()),
        where('createdBy', '==', userId),
        orderBy('createdAt', 'asc'),
      )
    : query(
        personsCollection(getDb()),
        where('createdBy', '==', userId),
        where('isPublic', '==', true),
        orderBy('createdAt', 'asc'),
      );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/**
 * The persona linked to a user account, or null.
 *
 * The persons read rule is evaluated per matched document, so a `userId ==` list
 * query that could match a *private* persona belonging to someone else is
 * rejected outright — not filtered. Left unpinned, one village member with a
 * private persona made every batch lookup reject (an empty organizer picker, a
 * profile screen stuck loading). So the query pins a rule branch: `isPublic ==
 * true` for anyone else's persona, and the unfiltered form only when the caller
 * *is* that user (`resource.data.userId == request.auth.uid`), which is what
 * keeps a caller's own private persona visible to them.
 *
 * Pass `viewerUid` whenever the answer must include the caller's own private
 * persona; omitting it yields the public-only view a stranger gets.
 */
export async function getPersonByUserId(
  userId: string,
  viewerUid?: string | null,
): Promise<(PersonData & { id: string }) | null> {
  const own = viewerUid != null && viewerUid === userId;
  const q = own
    ? query(personsCollection(getDb()), where('userId', '==', userId), limit(1))
    : query(
        personsCollection(getDb()),
        where('userId', '==', userId),
        where('isPublic', '==', true),
        limit(1),
      );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }))[0] ?? null;
}

export async function createPerson(input: PersonDataInput): Promise<string> {
  // addDoc routes through the typed converter, so createdAt must be a plain
  // Date (serverTimestamp sentinels are rejected by the schema). The converter
  // re-marshals the Date to a Firestore Timestamp on write.
  const ref = await addDoc(personsCollection(getDb()), buildPersonData(input));
  return ref.id;
}

export async function updatePerson(
  personId: string,
  data: Partial<Omit<PersonData, 'createdBy' | 'createdAt'>>,
): Promise<void> {
  // updateDoc bypasses the converter, so partial-update payloads (and any
  // FieldValue sentinels callers might pass through Partial) go on the raw
  // doc ref rather than the typed one.
  await updateDoc(doc(getDb(), 'persons', personId), data);
}

export async function deletePerson(personId: string): Promise<void> {
  await deleteDoc(personDoc(getDb(), personId));
}

/**
 * Set an account-holder's residence barrio within a village. Residence is
 * single-source-of-truth on the person's `municipalityLinks`, so this upserts
 * the entry for `municipalityId` directly (the caller owns their person doc).
 * `barrioId` null = "Todo el pueblo" (whole village). Written via
 * `buildResidenceLinks`, the single constructor of the exact
 * `{ municipalityId, barrioId }` shape the directory projection reads. No-op
 * when the user has no linked person.
 */
export async function updateResidenceBarrio(
  userId: string,
  municipalityId: string,
  barrioId: string | null,
): Promise<void> {
  const person = await getPersonByUserId(userId, userId);
  if (!person) return;
  const others = person.municipalityLinks.filter((l) => l.municipalityId !== municipalityId);
  await updatePerson(person.id, {
    municipalityLinks: [...others, ...buildResidenceLinks(municipalityId, barrioId)],
  });
}

/**
 * People buried in a given place (cemetery), via `burialPlace.placeId`.
 * Intentionally not scoped by municipality: `placeId` is a Firestore
 * auto-id from `/municipalities/{id}/places/`, so it is globally unique
 * and a bare `placeId` match cannot collide across villages.
 *
 * Two queries, not one, because the persons read rule is evaluated per matched
 * document: a query that could match a doc the caller may not read is rejected
 * outright rather than filtered. So each query pins one of the rule's branches —
 * `isPublic == true` for what anyone may read, `createdBy == viewerUid` for the
 * caller's own personas — and the results are merged here.
 *
 * Without the second query a private persona was missing even for the person who
 * created it, so their own relative silently vanished from the cemetery they had
 * just been buried in. Private still means invisible to *others* here: unlike the
 * pueblo and barrio rosters, which list everyone and only gate opening the card,
 * the cemetery has no function-owned projection to read names from (the people
 * directory deliberately excludes the deceased).
 */
export async function getPersonsByBurialPlace(
  placeId: string,
  viewerUid?: string | null,
): Promise<(PersonData & { id: string })[]> {
  const buriedHere = where('burialPlace.placeId', '==', placeId);
  const snaps = await Promise.all([
    getDocs(query(personsCollection(getDb()), buriedHere, where('isPublic', '==', true))),
    viewerUid
      ? getDocs(query(personsCollection(getDb()), buriedHere, where('createdBy', '==', viewerUid)))
      : null,
  ]);
  const byId = new Map<string, PersonData & { id: string }>();
  for (const snap of snaps) {
    for (const d of snap?.docs ?? []) byId.set(d.id, { id: d.id, ...d.data() });
  }
  return [...byId.values()].sort((a, b) => buildDisplayName(a).localeCompare(buildDisplayName(b)));
}

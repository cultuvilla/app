import type { DocumentReference, Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { inRange, type CartelInput, type WrappedInputs } from '@cultuvilla/shared/wrapped';
import { EventStatusSchema, RegistrationStatusSchema, isPrivateEvent, madridYear } from '@cultuvilla/shared/models';
import {
  eventRegistrationsCollection,
  eventsCollection,
  festivalPostersCollection,
  municipalityDoc,
  municipalityPeopleCollection,
  newsCollection,
  organizationDoc,
  personsCollection,
  userDoc,
} from '@cultuvilla/shared/firebase/refs/admin';

/**
 * Read everything a Wrapped is built from, for one municipality and one range.
 *
 * Paths come from the typed factories in `firebase/refs/admin`, so collection
 * names still have one source of truth — but each ref is taken with
 * `.withConverter(null)` and read as raw fields, only the few the Wrapped needs.
 *
 * That is deliberate: the same reader runs in the callable AND in the local
 * preview, which reads another environment's data with this branch's code. A
 * converter tightened on develop (a new required field) would throw on every
 * prod doc that predates it — the municipality converter already would, since
 * prod has no `community.fiestas` until that backfill runs there. A field that
 * is missing or mistyped here degrades to a safe default instead of failing
 * the whole Wrapped.
 */

export interface GatheredWrapped {
  villageName: string;
  villageSlug: string | null;
  escudoUrl: string | null;
  inputs: WrappedInputs;
  /** Everyone in the censo, for the people wall. */
  people: { personId: string; displayName: string; photoURL: string | null }[];
  /** The whole poster archive, every year, for the carteles card. */
  posters: CartelInput[];
  /** Articles published inside the range, oldest first, for the news card. */
  news: { id: string; title: string; publishedAt: Date; imageURL: string | null }[];
}

type Raw = Record<string, unknown>;

const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

function date(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (v && typeof v === 'object' && 'toDate' in v && typeof (v).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate();
  }
  return null;
}

/** Batched point reads; chunked so one Wrapped never issues an unbounded `getAll`. */
async function getByIds(
  db: Firestore,
  ids: string[],
  refFor: (id: string) => DocumentReference,
): Promise<Map<string, Raw>> {
  const out = new Map<string, Raw>();
  const unique = [...new Set(ids)];
  for (let i = 0; i < unique.length; i += 100) {
    const refs = unique.slice(i, i + 100).map(refFor);
    if (refs.length === 0) continue;
    const snaps = await db.getAll(...refs);
    for (const s of snaps) if (s.exists) out.set(s.id, s.data() as Raw);
  }
  return out;
}

/**
 * The profile photo of each account, keyed by uid.
 *
 * It lives on the account's own persona (`persons.userId`), not on `users/{uid}`,
 * which carries no photo at all — reading it there drew every organizer as
 * initials. Only a public persona lends its face: the credits card is a
 * forwardable image, and `isPublic: false` is someone opting out of exactly that.
 */
async function photosByUserId(db: Firestore, userIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  // `in` accepts at most 30 values per query.
  for (let i = 0; i < userIds.length; i += 30) {
    const chunk = userIds.slice(i, i + 30);
    const snap = await personsCollection(db).withConverter(null).where('userId', 'in', chunk).get();
    for (const d of snap.docs) {
      const p = d.data();
      const userId = str(p.userId);
      const photo = str(p.photoURL);
      if (userId && photo && p.isPublic === true && !out.has(userId)) out.set(userId, photo);
    }
  }
  return out;
}

/**
 * A download URL for a file in the default bucket, or null.
 *
 * News posts store a storage PATH, not a URL. The file's own download token
 * (set by every client upload) gives a URL on the image allowlist, so the
 * article covers go through the same bounded fetch as every other image —
 * and it needs no `signBlob` grant, which a v4 signed URL would.
 */
async function downloadUrl(path: string): Promise<string | null> {
  try {
    const file = getStorage().bucket().file(path);
    const [meta] = await file.getMetadata();
    const token = str(String(meta.metadata?.firebaseStorageDownloadTokens ?? '').split(',')[0]);
    if (!token) return null;
    return `https://firebasestorage.googleapis.com/v0/b/${file.bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`;
  } catch {
    return null;
  }
}

/** The picture an article is shown with: its cover, else its first image. */
function newsImagePath(n: Raw): string | null {
  const cover = n.coverImage as Raw | null | undefined;
  const images = Array.isArray(n.images) ? (n.images as Raw[]) : [];
  const blocks = Array.isArray(n.content) ? (n.content as Raw[]) : [];
  return (
    str(cover?.storagePath) ??
    str(images[0]?.storagePath) ??
    str(blocks.find((b) => b.type === 'image')?.storagePath)
  );
}

export async function gatherWrappedInputs(
  db: Firestore,
  municipalityId: string,
  range: { start: Date; end: Date },
): Promise<GatheredWrapped> {
  const muniSnap = await municipalityDoc(db, municipalityId).withConverter(null).get();
  if (!muniSnap.exists) throw new Error(`municipality ${municipalityId} not found`);
  const muni = muniSnap.data() as Raw;

  const eventsSnap = await eventsCollection(db).withConverter(null).where('municipalityId', '==', municipalityId).get();
  const events = eventsSnap.docs.flatMap((d) => {
    const e = d.data();
    const startDate = date(e.startDate);
    const status = EventStatusSchema.safeParse(e.status);
    if (!startDate || !status.success) return [];
    // An org-private event is visible only to that org's members, and every
    // Wrapped card is a forwardable image. Dropped here, before registrations
    // are read, so it reaches neither a card nor a stat nor the people wall.
    const visibility = e.visibility === 'organization' ? 'organization' : 'public';
    if (isPrivateEvent({ visibility, visibilityOrgId: str(e.visibilityOrgId) })) return [];
    return [
      {
        id: d.id,
        title: str(e.title) ?? '',
        status: status.data,
        startDate,
        imageURL: str(e.imageURL),
        commentCount: num(e.commentCount),
        maxAttendees: typeof e.maxAttendees === 'number' ? e.maxAttendees : null,
        createdBy: str(e.createdBy),
        organizerOrgIds: strs(e.organizerOrgIds),
        organizerUserIds: strs(e.organizerUserIds),
      },
    ];
  });

  // Registrations carry no municipalityId, so they are reachable only per
  // event. Only live, in-window events are worth reading.
  const relevant = events.filter((e) => e.status !== 'cancelled' && inRange(e.startDate, range));
  const regSnaps = await Promise.all(
    relevant.map((e) => eventRegistrationsCollection(db, e.id).withConverter(null).get()),
  );
  const registrations = regSnaps.flatMap((snap, i) =>
    snap.docs.flatMap((d) => {
      const r = d.data();
      const personId = str(r.personId);
      const userId = str(r.userId);
      const status = RegistrationStatusSchema.safeParse(r.status);
      if (!personId || !userId || !status.success) return [];
      return [{ eventId: relevant[i].id, personId, userId, status: status.data }];
    }),
  );

  // Only people whose profile is public. The people wall is a forwardable image
  // carrying names and faces — `isPublic: false` is someone opting out of
  // exactly that, so they are neither drawn nor counted. Strictly `=== true`:
  // a row missing the flag is treated as private, never as consent.
  const peopleSnap = await municipalityPeopleCollection(db)
    .withConverter(null)
    .where('municipalityId', '==', municipalityId)
    .get();
  const people = peopleSnap.docs.flatMap((d) => {
    const p = d.data();
    const personId = str(p.personId);
    if (!personId || p.isPublic !== true) return [];
    return [{ personId, displayName: str(p.displayName) ?? '?', photoURL: str(p.photoURL) }];
  });

  const orgIds = relevant.flatMap((e) => e.organizerOrgIds);
  const organizerIds = [
    ...new Set(relevant.flatMap((e) => (e.createdBy ? [...e.organizerUserIds, e.createdBy] : e.organizerUserIds))),
  ];
  const [orgDocs, userDocs, organizerPhotos] = await Promise.all([
    getByIds(db, orgIds, (id) => organizationDoc(db, id).withConverter(null)),
    getByIds(db, organizerIds, (id) => userDoc(db, id).withConverter(null)),
    photosByUserId(db, organizerIds),
  ]);

  const year = madridYear(range.start);
  // Every year, not just this one: the carteles card sets this year's posters
  // against the pueblo's whole archive. Only `active` posters: this becomes a
  // forwardable image, so it allowlists rather than excluding `hidden` — a
  // denylist would leak any moderation status added later.
  const postersSnap = await festivalPostersCollection(db)
    .withConverter(null)
    .where('municipalityId', '==', municipalityId)
    .get();
  const posters = postersSnap.docs.flatMap((d) => {
    const p = d.data();
    const images = strs(p.images);
    if (typeof p.year !== 'number' || p.status !== 'active') return [];
    return [{ id: d.id, year: p.year, title: str(p.title), imageURL: images.length > 0 ? images[0] : null }];
  });

  // The same range as everything else, so an admin who widens it to take in
  // the chronicle written the week before the fiestas gets exactly that.
  // Only `active`, for the same allowlist reason as the carteles.
  const newsSnap = await newsCollection(db).withConverter(null).where('municipalityId', '==', municipalityId).get();
  const newsDocs = newsSnap.docs
    .flatMap((d) => {
      const n = d.data();
      const publishedAt = date(n.publishedAt);
      if (!publishedAt || n.status !== 'active') return [];
      if (!inRange(publishedAt, range)) return [];
      return [{ id: d.id, title: str(n.title) ?? '', publishedAt, path: newsImagePath(n) }];
    })
    .sort((a, b) => a.publishedAt.getTime() - b.publishedAt.getTime());
  const news = await Promise.all(
    newsDocs.map(async ({ path, ...n }) => ({ ...n, imageURL: path ? await downloadUrl(path) : null })),
  );

  return {
    villageName: str(muni.name) ?? '',
    villageSlug: str(muni.slug),
    escudoUrl: str(muni.escudoManualUrl) ?? str(muni.escudoUrl),
    people,
    posters,
    news,
    inputs: {
      range,
      events,
      registrations,
      // An organization's picture is the first of its `images`; there is no
      // `imageURL` on an org doc, so reading one drew every org as initials.
      organizations: [...orgDocs].map(([id, o]) => ({ id, name: str(o.name) ?? '', imageURL: strs(o.images)[0] ?? null })),
      organizerProfiles: [...userDocs].map(([userId, u]) => ({
        userId,
        displayName: str(u.displayName) ?? '',
        photoURL: organizerPhotos.get(userId) ?? null,
      })),
      censoCount: people.length,
      censoPersonIds: people.map((p) => p.personId),
      posterCount: posters.filter((p) => p.year === year).length,
    },
  };
}

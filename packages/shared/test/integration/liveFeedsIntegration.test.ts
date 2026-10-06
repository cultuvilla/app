// The live village home and live entity detail (watch* + useWatch) against the
// real Firestore emulator and the shipped rules. A listener that the rules
// refuse, or whose snapshot the strict converter rejects, does not throw — the
// screen just never paints — so these pin that each feed's query is one the
// viewer may hold open, and that it follows the data on its own.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  type Firestore,
} from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAnon, asUser, seed } from '../helpers/roles';
import { buildEventData, type EventDataInput } from '../../src/models/event/EventDataModel';
import { buildNewsPostData } from '../../src/models/news/NewsPostDataModel';
import {
  watchEventsByMunicipality,
  watchPrivateEventsByMunicipality,
} from '../../src/services/eventService';
import { updateNewsPost, watchHomeFeed, watchNewsPost } from '../../src/services/newsService';
import * as firebaseModule from '../../src/firebase';
import { firebaseErrorCode } from '../../src/firebase/sdk/errors';

const getEnv = useRulesTestEnv();

afterEach(() => {
  vi.restoreAllMocks();
});

const DAY_MS = 24 * 60 * 60 * 1000;

function uniq(prefix: string): string {
  return `${prefix}-${String(Date.now())}-${Math.random().toString(36).slice(2, 7)}`;
}

async function asSeeder(write: (db: Firestore) => Promise<void>): Promise<void> {
  await seed(getEnv(), async (ctx) => {
    await write(ctx.firestore() as unknown as Firestore);
  });
}

function eventData(
  municipalityId: string,
  title: string,
  startInDays: number,
  over: Partial<EventDataInput> = {},
) {
  return buildEventData({
    title,
    description: 'desc',
    startDate: new Date(Date.now() + startInDays * DAY_MS),
    location: { coordinates: { lat: 40, lng: -3 }, displayName: 'Plaza' },
    organizerUserIds: ['organizer'],
    organizerOrgIds: [],
    createdBy: 'organizer',
    municipalityId,
    villageName: 'Villa',
    villageSlug: 'villa',
    villageCoordinates: null,
    ...over,
  });
}

function newsData(municipalityId: string, title: string, publishedAt: Date, createdBy = 'author') {
  return buildNewsPostData({
    municipalityId,
    villageSlug: 'villa',
    createdBy,
    organizerUserIds: [createdBy],
    title,
    body: 'cuerpo',
    category: 'fiesta',
    createdAt: publishedAt,
    updatedAt: publishedAt,
  });
}

/** Resolves with the latest emission once `accept` holds for it. */
function latestMatching<T>(emissions: T[], accept: (latest: T) => boolean): Promise<T> {
  return vi.waitFor(
    () => {
      const latest = emissions.at(-1);
      if (emissions.length === 0 || !accept(latest as T)) throw new Error('waiting for the next emission');
      return latest as T;
    },
    { timeout: 5000, interval: 25 },
  );
}

const failOnError = (error: Error) => {
  throw error;
};

const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe('watchEventsByMunicipality (the pueblo tab, anonymous)', () => {
  it('lists only the public events of that village in the asked status, and picks up a publish live', async () => {
    const M = uniq('m');
    await asSeeder(async (db) => {
      await setDoc(doc(db, 'events', `${M}-public`), eventData(M, 'Verbena', 3));
      await setDoc(doc(db, 'events', `${M}-draft`), eventData(M, 'Borrador', 1, { status: 'draft' }));
      await setDoc(
        doc(db, 'events', `${M}-private`),
        eventData(M, 'Cena de socios', 2, { visibility: 'organization', visibilityOrgId: 'org-x' }),
      );
      await setDoc(doc(db, 'events', `${M}-elsewhere`), eventData(uniq('other'), 'Ajena', 2));
    });
    vi.spyOn(firebaseModule, 'getDb').mockReturnValue(asAnon(getEnv()));

    const emissions: { title: string }[][] = [];
    const unwatch = watchEventsByMunicipality(M, ['published', 'completed'], (e) => emissions.push(e), failOnError);
    try {
      expect(titles(await latestMatching(emissions, () => true))).toEqual(['Verbena']);
      await asSeeder((db) => updateDoc(doc(db, 'events', `${M}-draft`), { status: 'published' }));
      // Ordered by start date: the newly published one starts sooner.
      expect(titles(await latestMatching(emissions, (e) => e.length === 2))).toEqual(['Borrador', 'Verbena']);
    } finally {
      unwatch();
    }
  });
});

describe('watchPrivateEventsByMunicipality (an org member’s private calendar)', () => {
  async function seedOrgs(M: string, orgs: string[], memberUid: string): Promise<void> {
    await asSeeder(async (db) => {
      await setDoc(doc(db, `municipalities/${M}/members/${memberUid}`), { role: 'user', joinedAt: new Date() });
      for (const orgId of orgs) {
        await setDoc(doc(db, `organizations/${orgId}`), { name: orgId, municipalityId: M, joinPolicy: 'approval' });
        await setDoc(doc(db, `organizations/${orgId}/members/${memberUid}`), {
          userId: memberUid,
          role: 'member',
          joinedAt: new Date(),
        });
      }
    });
  }

  it('merges one listener per org, keeps only this village, and follows a new private event', async () => {
    const M = uniq('m');
    const ORG_A = uniq('orgA');
    const ORG_B = uniq('orgB');
    await seedOrgs(M, [ORG_A, ORG_B], 'socio');
    const privateTo = (orgId: string) => ({ visibility: 'organization' as const, visibilityOrgId: orgId });
    await asSeeder(async (db) => {
      await setDoc(doc(db, 'events', `${ORG_A}-cena`), eventData(M, 'Cena A', 5, privateTo(ORG_A)));
      await setDoc(doc(db, 'events', `${ORG_B}-junta`), eventData(M, 'Junta B', 2, privateTo(ORG_B)));
      // Same org, another village: the merge filters it out in memory.
      await setDoc(doc(db, 'events', `${ORG_B}-fuera`), eventData(uniq('other'), 'Fuera', 1, privateTo(ORG_B)));
    });
    vi.spyOn(firebaseModule, 'getDb').mockReturnValue(asUser(getEnv(), 'socio'));

    const emissions: { title: string }[][] = [];
    const unwatch = watchPrivateEventsByMunicipality(
      M,
      [ORG_A, ORG_B],
      'published',
      (e) => emissions.push(e),
      failOnError,
    );
    try {
      expect(titles(await latestMatching(emissions, () => true))).toEqual(['Junta B', 'Cena A']);
      await asSeeder((db) =>
        setDoc(doc(db, 'events', `${ORG_A}-ensayo`), eventData(M, 'Ensayo A', 3, privateTo(ORG_A))),
      );
      expect(titles(await latestMatching(emissions, (e) => e.length === 3))).toEqual([
        'Junta B',
        'Ensayo A',
        'Cena A',
      ]);
    } finally {
      unwatch();
    }
  });

  // The rules REFUSE a non-member's query rather than filtering it — that is the
  // security property, and it still holds. What the watcher does with the
  // refusal is the product's choice: an org whose private events the viewer
  // cannot read contributes nothing, so it cannot blank the other orgs'.
  it('answers a refused org with no events — the rules still refuse the query itself', async () => {
    const M = uniq('m');
    const ORG = uniq('org');
    await seedOrgs(M, [ORG], 'socio');
    await asSeeder((db) =>
      setDoc(
        doc(db, 'events', `${ORG}-cena`),
        eventData(M, 'Cena', 5, { visibility: 'organization', visibilityOrgId: ORG }),
      ),
    );
    const outsider = asUser(getEnv(), 'outsider');
    vi.spyOn(firebaseModule, 'getDb').mockReturnValue(outsider);

    const refusal = await getDocs(query(collection(outsider, 'events'), where('visibilityOrgId', '==', ORG))).then(
      () => null,
      (error: unknown) => error,
    );
    expect(firebaseErrorCode(refusal)).toBe('permission-denied');

    const emissions: unknown[][] = [];
    const onError = vi.fn();
    const unwatch = watchPrivateEventsByMunicipality(M, [ORG], 'published', (rows) => emissions.push(rows), onError);
    try {
      const latest = await latestMatching(emissions, () => true);
      expect(latest).toEqual([]);
      expect(onError).not.toHaveBeenCalled();
    } finally {
      unwatch();
    }
  });
});

describe('watchHomeFeed (the village home news strip, anonymous)', () => {
  it('lists the village’s active posts newest first and drops one the moment it is hidden', async () => {
    const M = uniq('m');
    const now = Date.now();
    await asSeeder(async (db) => {
      await setDoc(doc(db, 'news', `${M}-old`), newsData(M, 'Antigua', new Date(now - 2 * DAY_MS)));
      await setDoc(doc(db, 'news', `${M}-new`), newsData(M, 'Reciente', new Date(now - DAY_MS)));
      await setDoc(doc(db, 'news', `${M}-elsewhere`), newsData(uniq('other'), 'Ajena', new Date(now)));
    });
    vi.spyOn(firebaseModule, 'getDb').mockReturnValue(asAnon(getEnv()));

    const emissions: { title: string }[][] = [];
    const unwatch = watchHomeFeed(M, { limit: 10 }, (p) => emissions.push(p), failOnError);
    try {
      expect(titles(await latestMatching(emissions, () => true))).toEqual(['Reciente', 'Antigua']);
      // Moderation soft-hide is a function-owned write; the seeder stands in for it.
      await asSeeder((db) => updateDoc(doc(db, 'news', `${M}-new`), { status: 'hidden' }));
      expect(titles(await latestMatching(emissions, (p) => p.length === 1))).toEqual(['Antigua']);
    } finally {
      unwatch();
    }
  });
});

describe('watchNewsPost after the author saves an edit', () => {
  // The listener sees the author's own pending write before the server acks
  // it, with `updatedAt: serverTimestamp()` still unresolved. Reading that as
  // null made the strict converter throw and the reopened article go blank.
  it('emits the edited post from the pending write instead of failing to parse it', async () => {
    const M = uniq('m');
    const postId = uniq('post');
    await asSeeder(async (db) => {
      await setDoc(doc(db, `municipalities/${M}/members/author`), { role: 'user', joinedAt: new Date() });
      await setDoc(doc(db, 'news', postId), newsData(M, 'Borrador', new Date()));
    });
    vi.spyOn(firebaseModule, 'getDb').mockReturnValue(asUser(getEnv(), 'author'));

    const emissions: ({ title: string; updatedAt: Date } | null)[] = [];
    const errors: Error[] = [];
    const unwatch = watchNewsPost(postId, (p) => emissions.push(p), (e) => errors.push(e));
    try {
      await latestMatching(emissions, (p) => p?.title === 'Borrador');
      await updateNewsPost(postId, { title: 'Definitivo' });
      const edited = await latestMatching(emissions, (p) => p?.title === 'Definitivo');
      expect(edited?.updatedAt).toBeInstanceOf(Date);
      expect(errors).toEqual([]);
    } finally {
      unwatch();
    }
  });
});

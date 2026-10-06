// The `watch*` service functions against the real Firestore emulator: a
// listener answers with what is there, then again on its own when the data
// changes — which is what lets a screen stop reloading on focus.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deleteDoc, doc, setDoc, updateDoc, type Firestore } from 'firebase/firestore';
import { useRulesTestEnv } from '../helpers/rulesTestEnv';
import { asAnon, seed } from '../helpers/roles';
import { festivalPosterDoc, festivalPostersCollection } from '../../src/firebase/refs/client';
import { buildFestivalPosterData } from '../../src/models/festivalPoster/FestivalPosterDataModel';
import { watchFestivalPoster, watchFestivalPosters } from '../../src/services/festivalPosterService';
import * as firebaseModule from '../../src/firebase';

const getEnv = useRulesTestEnv();

afterEach(() => {
  vi.restoreAllMocks();
});

async function seedPoster(municipalityId: string, year: number, id?: string): Promise<void> {
  await seed(getEnv(), async (ctx) => {
    const db = ctx.firestore() as unknown as Firestore;
    await setDoc(
      id ? festivalPosterDoc(db, id) : doc(festivalPostersCollection(db)),
      buildFestivalPosterData({ municipalityId, villageSlug: 'pueblo', year, createdAt: new Date() }),
    );
  });
}

async function asSeeder(write: (db: Firestore) => Promise<void>): Promise<void> {
  await seed(getEnv(), async (ctx) => {
    await write(ctx.firestore() as unknown as Firestore);
  });
}

function nextEmission<T>(emissions: T[][], count: number): Promise<T[]> {
  return vi.waitFor(
    () => {
      if (emissions.length < count) throw new Error(`waiting for emission ${String(count)}`);
      return emissions[count - 1];
    },
    { timeout: 5000, interval: 25 },
  );
}

describe('watchFestivalPosters', () => {
  it('emits the current posters, then again when one is added', async () => {
    const municipalityId = `m-${String(Date.now())}`;
    await seedPoster(municipalityId, 2024);
    vi.spyOn(firebaseModule, 'getDb').mockReturnValue(asAnon(getEnv()));

    const emissions: { year: number }[][] = [];
    const unwatch = watchFestivalPosters(
      municipalityId,
      (posters) => emissions.push(posters),
      (error) => {
        throw error;
      },
    );
    try {
      expect((await nextEmission(emissions, 1)).map((p) => p.year)).toEqual([2024]);
      await seedPoster(municipalityId, 2025);
      const later = await vi.waitFor(
        () => {
          const latest = emissions.at(-1) ?? [];
          if (latest.length < 2) throw new Error('waiting for the new poster');
          return latest;
        },
        { timeout: 5000, interval: 25 },
      );
      expect(later.map((p) => p.year)).toEqual([2025, 2024]);
    } finally {
      unwatch();
    }
  });
});

describe('watchFestivalPoster', () => {
  it('emits the poster, again when it changes, and null once it is gone', async () => {
    const posterId = `poster-${String(Date.now())}`;
    await seedPoster(`m-${String(Date.now())}`, 2024, posterId);
    vi.spyOn(firebaseModule, 'getDb').mockReturnValue(asAnon(getEnv()));

    const emissions: ({ year: number } | null)[] = [];
    const unwatch = watchFestivalPoster(
      posterId,
      (poster) => emissions.push(poster),
      (error) => {
        throw error;
      },
    );
    const latestMatching = (accept: (poster: { year: number } | null | undefined) => boolean) =>
      vi.waitFor(
        () => {
          const latest = emissions.at(-1);
          if (emissions.length === 0 || !accept(latest)) throw new Error('waiting for the next emission');
          return latest;
        },
        { timeout: 5000, interval: 25 },
      );
    try {
      expect((await latestMatching((p) => p?.year === 2024))?.year).toBe(2024);
      await asSeeder((db) => updateDoc(doc(db, 'festivalPosters', posterId), { year: 2025 }));
      expect((await latestMatching((p) => p?.year === 2025))?.year).toBe(2025);
      await asSeeder((db) => deleteDoc(doc(db, 'festivalPosters', posterId)));
      expect(await latestMatching((p) => p === null)).toBeNull();
    } finally {
      unwatch();
    }
  });
});

import { z } from 'zod';
import type { MunicipalityData } from './MunicipalityDataModel';
import { escudoFullUrl, hasManualEscudo } from './MunicipalityDataModel';

/**
 * The active pueblos ranked by how much they have to show, stored at
 * `villageRankings/{VILLAGE_RANKING_DOC}`. A single doc rewritten nightly by the
 * `refreshVillageRanking` function, so "other villages" costs a reader one doc
 * read instead of a count query per pueblo. Function-owned; anyone may read it.
 */
export const VILLAGE_RANKING_DOC = 'top';

/** How many pueblos the doc keeps — enough for any screen that shows "the best few". */
export const VILLAGE_RANKING_SIZE = 20;

/** How many other pueblos a village page suggests. */
export const OTHER_VILLAGES_SHOWN = 5;

export const RankedVillageSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  province: z.string(),
  escudoUrl: z.string().nullable(),
  /** The admin uploaded their own escudo — show it full-bleed, not as a small crest. */
  manualEscudo: z.boolean(),
  score: z.number(),
});
export type RankedVillage = z.infer<typeof RankedVillageSchema>;

export const VillageRankingDataSchema = z.object({
  computedAt: z.date(),
  /** Best first. */
  villages: z.array(RankedVillageSchema),
});
export type VillageRankingData = z.infer<typeof VillageRankingDataSchema>;

/** What a pueblo has published, counted the way its public page lists it. */
export interface VillageContentCounts {
  upcomingEvents: number;
  events: number;
  news: number;
  posters: number;
  organizations: number;
  places: number;
  history: number;
  words: number;
  people: number;
}

type ProfileFields = Pick<MunicipalityData, 'escudoManualUrl' | 'coordinates' | 'community'>;

// Counts weigh by log2(1 + n): the first few items of a kind say far more about
// a pueblo than the hundredth, and one huge village must not bury every other.
const COUNT_WEIGHTS: Readonly<Record<keyof VillageContentCounts, number>> = {
  upcomingEvents: 3,
  events: 1.5,
  news: 2,
  posters: 1.5,
  organizations: 2,
  places: 1.5,
  history: 1.5,
  words: 1,
  people: 1,
};

const PROFILE_POINTS = 2;

/** Profile fields a pueblo has filled in: escudo, description, map, fiestas, Embajador. */
export function villageProfileCompleteness(m: ProfileFields): number {
  const c = m.community;
  return [
    hasManualEscudo(m),
    Boolean(c?.description.trim()),
    m.coordinates != null,
    (c?.fiestas.length ?? 0) > 0,
    c?.organizerId != null,
  ].filter(Boolean).length;
}

export function villageRichnessScore(m: ProfileFields, counts: VillageContentCounts): number {
  const content = (Object.keys(COUNT_WEIGHTS) as (keyof VillageContentCounts)[]).reduce(
    (sum, k) => sum + COUNT_WEIGHTS[k] * Math.log2(1 + Math.max(0, counts[k])),
    0,
  );
  return content + PROFILE_POINTS * villageProfileCompleteness(m);
}

/** Best first; ties by name, so the order is stable from one night to the next. */
export function rankVillages(
  entries: { id: string; municipality: MunicipalityData; counts: VillageContentCounts }[],
  size = VILLAGE_RANKING_SIZE,
): RankedVillage[] {
  return entries
    .map(({ id, municipality: m, counts }) => ({
      id,
      name: m.name,
      slug: m.slug,
      province: m.province,
      escudoUrl: escudoFullUrl(m),
      manualEscudo: hasManualEscudo(m),
      score: Math.round(villageRichnessScore(m, counts) * 100) / 100,
    }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name, 'es'))
    .slice(0, size);
}

/** The best-ranked pueblos other than the one being viewed. */
export function otherRankedVillages(villages: RankedVillage[], excludeId: string, limit: number): RankedVillage[] {
  return villages.filter((v) => v.id !== excludeId).slice(0, limit);
}

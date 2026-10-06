import { z } from 'zod';
import { LatLngSchema, type LatLng } from '../core/LocationDataModel';
import { visibilityFields, defaultVisibility } from '../core/VisibilityModel';
import { contributorFields } from '../core/ContributorsModel';
import { VillageProfileFormSchema } from './CensoTypes';
import { FiestaBlockSchema } from './FiestaBlockModel';
import { SexSchema, type Sex } from '../core/SexModel';

/**
 * A municipality is the canonical Spanish administrative unit (INE-coded).
 * It is the *physical* place. When a community of users activates Cultuvilla
 * for that municipality, the `community` subfield is populated — at that
 * moment the municipality "becomes" a village in the user-facing sense.
 *
 * 1:1 invariant: there is at most one community per municipality, enforced
 * structurally by storing the community inside the municipality doc.
 */

export const VillageCommunitySchema = z.object({
  description: z.string(),
  /** The village organizer (founding admin). `null` while the community has been
   * "started" by a villager but nobody has been granted the organizer role yet —
   * during that window any member can edit the basic info (wiki phase). */
  organizerId: z.string().nullable(),
  /** Denormalized from the organizer's own person doc so every viewer can say
   *  "Embajador" or "Embajadora" — persons are often private, and copying `sex`
   *  onto the public user doc would expose it for everyone, not just the one
   *  person whose title reveals it anyway. Kept in sync by the functions that
   *  move `organizerId` and by syncPersonDenormalization. */
  organizerSex: SexSchema.nullable(),
  profileForm: VillageProfileFormSchema.nullable(),
  /** When this village's fiestas are — one block per distinct celebration.
   *  Empty until an admin declares them; a village with none never gets a
   *  Wrapped, which is the intended gate. See FiestaBlockModel. */
  fiestas: z.array(FiestaBlockSchema),
  activatedAt: z.date(),
});
export type VillageCommunity = z.infer<typeof VillageCommunitySchema>;

/**
 * Normalize a municipality name for prefix-search: NFD-decompose, strip
 * combining marks, lowercase. "Ávila" → "avila", "Castellón" → "castellon".
 * Used to populate the `nameLower` field on every municipality doc.
 */
export function municipalitySearchKey(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Words that carry no distinguishing signal on their own. Spanish municipality
 * names are overwhelmingly `<generic> de <distinctive>`, so indexing these as
 * standalone tokens would put `de` on 3,400 documents and buy nothing — a user
 * never searches for "de". They are dropped only from *token* indexing; the
 * whole-string prefixes below still span them, so "villanueva de las m" works.
 */
const SEARCH_STOPWORDS = new Set([
  'de', 'del', 'la', 'las', 'el', 'los', 'lo', 'y', 'e', 'i',
  'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os',
  'en', 'sa', 'ses', 'es', 'ets', 'na',
]);

/** Longest token/name we generate prefixes for. Nothing in the INE dataset comes
 *  close, but an unbounded loop over a pathological string is a footgun. */
const MAX_PREFIX_LENGTH = 40;

function pushPrefixes(source: string, into: Set<string>): void {
  const limit = Math.min(source.length, MAX_PREFIX_LENGTH);
  for (let i = 1; i <= limit; i++) into.add(source.slice(0, i));
}

/**
 * Every prefix a user could plausibly type to find this municipality, as a flat
 * array for a single `array-contains` query.
 *
 * Two families are indexed:
 *
 * 1. **Whole-string prefixes** of the normalized name — what the old
 *    `nameLower >= key < key + \uf8ff` range query matched. Keeps multi-word
 *    typing ("san sebast", "villanueva de las m") narrowing as you type.
 * 2. **Per-token prefixes** of every non-stopword word. This is the fix: the
 *    leading generic becomes optional, so `manzanas` finds
 *    *Villanueva de las Manzanas* and `aires` finds *Villarino de los Aires*.
 *    42% of Spanish municipality names are multi-word, and residents type the
 *    distinctive word, not the generic one.
 *
 * `aliases` (official-language names — Donostia, Lleida, A Coruña) and
 * `localities` (the entidades singulares *inside* the municipality — Villarino
 * de Manzanas inside Figueruela de Arriba) are folded into both families. Most
 * Spanish villages are not municipios, so without the latter a resident
 * searching for the name of the place they actually live in gets nothing.
 *
 * Prefixes are accent-stripped and lowercased, so the array is queried with the
 * output of `municipalitySearchKey`. The result is deduplicated and sorted so
 * regenerating it produces a byte-identical field and the backfill stays a no-op.
 */
export function municipalitySearchPrefixes(
  name: string,
  aliases: string[] = [],
  localities: string[] = [],
): string[] {
  const prefixes = new Set<string>();

  for (const source of [name, ...aliases, ...localities]) {
    const normalized = municipalitySearchKey(source).trim().replace(/\s+/g, ' ');
    if (normalized.length === 0) continue;

    pushPrefixes(normalized, prefixes);

    // Split on anything that isn't a letter or digit: whitespace, but also the
    // commas and apostrophes in "Castillo de Aro, Playa de Aro y S'Agaró".
    const tokens = normalized.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);
    for (const token of tokens) {
      // A stopword that is the entire name ("Es") is the name — keep it.
      if (tokens.length > 1 && SEARCH_STOPWORDS.has(token)) continue;
      pushPrefixes(token, prefixes);
    }
  }

  return [...prefixes].sort();
}

/**
 * The locality whose name explains why this municipality matched `query`, or
 * `null` when the municipality matched on its own name or an alias.
 *
 * A search for "Villarino de Manzanas" returning a row that just says
 * "Figueruela de Arriba" looks like the wrong answer. Naming the pedanía turns
 * it into the right one.
 *
 * Mirrors the token rule in `municipalitySearchPrefixes`: any *word* of the
 * locality may carry the match, not only the first.
 */
export function matchedLocality(localities: string[], query: string): string | null {
  const key = municipalitySearchKey(query).trim();
  if (key.length === 0) return null;
  for (const locality of localities) {
    const normalized = municipalitySearchKey(locality).trim().replace(/\s+/g, ' ');
    if (normalized.startsWith(key)) return locality;
    const tokens = normalized.split(/[^\p{L}\p{N}]+/u).filter((t) => t.length > 0);
    if (tokens.some((token) => token.startsWith(key))) return locality;
  }
  return null;
}

export const MunicipalityDataSchema = z.object({
  // ── Reference data (INE-seeded, immutable in practice) ─────────────────
  name: z.string(),
  /** Accent-stripped, lowercased copy of `name` for case/accent-insensitive
   * prefix search. Always derivable from `name`; stored so Firestore can index. */
  nameLower: z.string(),
  /** Official-language names for the same municipality — "Donostia" for San
   *  Sebastián, "Lleida" for Lérida, "A Coruña" for La Coruña. The dataset is
   *  seeded with Spanish exonyms only, which left Basque/Catalan/Galician
   *  speakers unable to find their own pueblo by the name they use. Sourced
   *  from Wikidata labels; empty for the ~85% of municipalities whose name is
   *  the same in every language. */
  nameAliases: z.array(z.string()),
  /** The entidades singulares de población inside this municipality — pedanías,
   *  anejos, aldeas. They are indexed for search but are not entities of their
   *  own: you cannot join, post to or administer one, it only leads you to its
   *  municipio. Empty for a municipality that is a single settlement. */
  localityNames: z.array(z.string()),
  /** Flattened prefix index over `name` + `nameAliases` + `localityNames` — see
   *  `municipalitySearchPrefixes`. Queried with `array-contains` so search
   *  matches any *word* of the name, not just the first. */
  searchPrefixes: z.array(z.string()),
  province: z.string(),
  comunidadAutonoma: z.string(),
  codigoINE: z.string(),
  /** Permanent URL slug — `/matabuena`. Assigned once by `assignMunicipalitySlugs`
   *  and never changed, not even on a rename: it is a permalink. */
  slug: z.string(),
  coordinates: LatLngSchema.nullable(),
  /** Human-readable name of `coordinates` ("Plaza Mayor, Abadía, Cáceres"),
   *  captured when the organizer picks the spot. Stored rather than resolved on
   *  read so every surface shows the same name without a geocoding round-trip —
   *  and so the UI never has to fall back to showing the raw coordinates.
   *  `null` when no location is set, or when it predates this field. */
  locationLabel: z.string().nullable(),
  /** Organizer-chosen zoom level for the village location map (Google Static
   *  Maps zoom). `null` when unset; readers fall back to a default. */
  mapZoom: z.number().nullable(),
  createdAt: z.date(),

  // ── Escudo (coat of arms, sourced from Wikidata P94 → Cloud Storage) ──
  /** Public URL for the 256×256 WebP. `null` when Wikidata has no escudo for this INE.
   *  Owned by the `escudos:upload` pipeline — it overwrites this on every run, so
   *  never store an admin upload here (it would be clobbered). */
  escudoUrl: z.string().nullable(),
  /** Public URL for the 64×64 WebP thumbnail. Also pipeline-owned. */
  escudoThumbUrl: z.string().nullable(),
  /**
   * Escudo uploaded by a village admin from the app. When set, it takes
   * precedence over the Wikidata-sourced `escudoUrl` everywhere (see
   * `escudoFullUrl` / `escudoThumbDisplayUrl`). Clearing it reverts the village
   * to the Wikidata escudo. Its presence IS the "manually uploaded" signal — no
   * separate flag to keep in sync. `null` when the village uses the Wikidata escudo.
   */
  escudoManualUrl: z.string().nullable(),

  // ── Community overlay ─────────────────────────────────────────────────
  community: VillageCommunitySchema.nullable(),
  /** Denorm of `community != null` — needed for queries since Firestore
   * can't index "field exists" cheaply. */
  communityActive: z.boolean(),
});
export type MunicipalityData = z.infer<typeof MunicipalityDataSchema>;

export interface MunicipalityDataInput {
  name: string;
  province: string;
  comunidadAutonoma: string;
  codigoINE: string;
  slug: string;
  nameAliases?: string[];
  localityNames?: string[];
  coordinates?: LatLng | null;
  locationLabel?: string | null;
  mapZoom?: number | null;
  escudoUrl?: string | null;
  escudoThumbUrl?: string | null;
  escudoManualUrl?: string | null;
}

/** Fields needed to resolve which escudo image to display. */
type EscudoFields = Pick<
  MunicipalityData,
  'escudoUrl' | 'escudoThumbUrl' | 'escudoManualUrl'
>;

/** True when a village admin has uploaded a custom escudo. */
export function hasManualEscudo(m: Pick<MunicipalityData, 'escudoManualUrl'>): boolean {
  return m.escudoManualUrl != null;
}

/** Full-size escudo to display: the manual upload wins over the Wikidata one. */
export function escudoFullUrl(m: EscudoFields): string | null {
  return m.escudoManualUrl ?? m.escudoUrl;
}

/**
 * Thumbnail-size escudo to display. Manual uploads have no separate thumbnail,
 * so the full manual image is reused (displayed small); otherwise the Wikidata
 * 64×64 thumb.
 */
export function escudoThumbDisplayUrl(m: EscudoFields): string | null {
  return m.escudoManualUrl ?? m.escudoThumbUrl;
}

export function buildMunicipalityData(input: MunicipalityDataInput): MunicipalityData {
  return {
    name: input.name,
    nameLower: municipalitySearchKey(input.name),
    nameAliases: input.nameAliases ?? [],
    localityNames: input.localityNames ?? [],
    searchPrefixes: municipalitySearchPrefixes(
      input.name,
      input.nameAliases ?? [],
      input.localityNames ?? [],
    ),
    province: input.province,
    comunidadAutonoma: input.comunidadAutonoma,
    codigoINE: input.codigoINE,
    slug: input.slug,
    coordinates: input.coordinates ?? null,
    locationLabel: input.locationLabel ?? null,
    mapZoom: input.mapZoom ?? null,
    createdAt: new Date(),
    escudoUrl: input.escudoUrl ?? null,
    escudoThumbUrl: input.escudoThumbUrl ?? null,
    escudoManualUrl: input.escudoManualUrl ?? null,
    community: null,
    communityActive: false,
  };
}

export interface ActivateCommunityInput {
  description: string;
  organizerId?: string | null;
  organizerSex?: Sex | null;
  coordinates?: LatLng | null;
}

export function buildVillageCommunity(input: ActivateCommunityInput): VillageCommunity {
  return {
    description: input.description,
    organizerId: input.organizerId ?? null,
    organizerSex: input.organizerSex ?? null,
    profileForm: null,
    fiestas: [],
    activatedAt: new Date(),
  };
}

// ── Barrios (subcollection: /municipalities/{id}/barrios/{barrioId}) ────
//
// Any village member may propose a barrio/place; it lands `active` and is
// visible to everyone immediately. Organizers (village/app admin) can hide it
// afterward via the visibility model. Enforcement lives in firestore.rules.

/**
 * What a subdivision of a municipality actually is. Spain has no single word:
 * a *barrio* is a neighbourhood **within** a settlement, while a *pedanía* is a
 * separate settlement kilometres away, and Galicia and Asturias group their
 * settlements (*aldeas*, strictly *lugares*) into *parroquias*, which carry
 * most of the local identity there.
 *
 * The distinction is not cosmetic — it decides which horizontal section a row
 * renders in, and each section is titled with the word that region actually
 * uses. Folding them into one word would flatten exactly the thing this model
 * exists to represent.
 *
 * `pedania` vs `aldea` is derived structurally at seed time: a municipality
 * whose settlements sit under parroquias gets `aldea`. That keeps Asturias
 * correct without a hardcoded province list.
 *
 * The precise Galician word is *lugar*, but "Lugares" is already the title of
 * the `places` section (cementerios, iglesias, ermitas) on the same screen.
 * "Aldeas" is real Galician vocabulary and collides with nothing.
 */
export const BarrioKindSchema = z.enum(['barrio', 'pedania', 'aldea', 'parroquia']);
export type BarrioKind = z.infer<typeof BarrioKindSchema>;

/** Where the row came from. Seeded rows stay editable, but provenance lets the
 *  UI show it and lets a future re-seed tell its own rows from a human's. */
export const BarrioSourceSchema = z.enum(['user', 'osm']);
export type BarrioSource = z.infer<typeof BarrioSourceSchema>;

export const BarrioDataSchema = z.object({
  name: z.string(),
  municipalityId: z.string(),
  kind: BarrioKindSchema,
  source: BarrioSourceSchema,
  /**
   * The municipal seat — the settlement the ayuntamiento sits in.
   *
   * It gets a row like any other or residents of the main village would have
   * nowhere to live while residents of the pedanías did, leaving `residentCount`
   * and the censo asymmetric. It is frequently NOT the municipality's own name:
   * Aramaio's seat is a village called Ibarra. Exactly one row per municipality
   * carries this.
   */
  isSeat: z.boolean(),
  /** Public download URLs for the barrio's pictures (max 5). `images[0]` is
   *  the hero/cover shown in the detail scaffold. */
  images: z.array(z.string()).max(5),
  createdAt: z.date(),
  proposedBy: z.string().nullable(),
  // Denormalized interaction counters, maintained server-side by the comments
  // Cloud Function trigger / the detail-screen view tracker. Initialized to 0
  // at create.
  commentCount: z.number().int(),
  readCount: z.number().int(),
  // Denormalized resident count — kept in sync by
  // functions/src/village/syncBarrioResidentCount.ts as persons gain/lose/switch
  // this barrio in their `municipalityLinks`. Lets the village hub order barrios
  // by population without an N+1 count-aggregate fan-out. Initialized to 0.
  residentCount: z.number().int(),
  ...visibilityFields,
});
export type BarrioData = z.infer<typeof BarrioDataSchema>;

export interface BarrioDataInput {
  name: string;
  municipalityId: string;
  kind?: BarrioKind;
  source?: BarrioSource;
  isSeat?: boolean;
  images?: string[];
  proposedBy?: string | null;
}

export function buildBarrioData(input: BarrioDataInput): BarrioData {
  return {
    name: input.name,
    municipalityId: input.municipalityId,
    // A hand-created row is a neighbourhood by default — that is the only kind
    // a user may create; the settlement kinds are seeded.
    kind: input.kind ?? 'barrio',
    source: input.source ?? 'user',
    isSeat: input.isSeat ?? false,
    images: input.images ?? [],
    createdAt: new Date(),
    proposedBy: input.proposedBy ?? null,
    commentCount: 0,
    readCount: 0,
    residentCount: 0,
    ...defaultVisibility(),
  };
}

// ── Places (subcollection: /municipalities/{id}/places/{placeId}) ────────
//
// Notable places within a municipality (cemeteries, churches, etc.),
// discriminated by `kind`. `cemetery` is load-bearing: it is the target of
// Person.burialPlace (see PersonDataModel.BurialPlaceSchema). Barrios remain a
// separate concept — they are administrative subdivisions, not physical sites.

export const PlaceKindSchema = z.enum([
  'cemetery',
  'church', // iglesia — parish church in the village
  'hermitage', // ermita — standalone chapel/shrine, often on the outskirts
  'plaza', // plaza — main square (an open area, not a building)
  'town_hall', // ayuntamiento — civic seat
  'otros', // otros — any notable place that doesn't fit the categories above
]);
export type PlaceKind = z.infer<typeof PlaceKindSchema>;

/**
 * Every place kind, in schema (display) order. Drives the client kind picker;
 * derived from the schema so the two can't drift apart.
 */
export const PLACE_KINDS: readonly PlaceKind[] = PlaceKindSchema.options;

export const PlaceDataSchema = z.object({
  name: z.string(),
  kind: PlaceKindSchema,
  description: z.string().nullable(),
  municipalityId: z.string(),
  /** Exact spot of the place, when someone has pinned it. Optional on purpose:
   *  a village knows its ermita long before anyone bothers to place it on a
   *  map, and an unpinned place must stay creatable. `null` when unset. */
  coordinates: LatLngSchema.nullable(),
  /** Human-readable name of `coordinates` ("Calle Real 4, Abadía"), captured
   *  when the spot was picked. Stored rather than resolved on read so every
   *  surface shows the same name without a geocoding round-trip, and so the UI
   *  never falls back to showing raw coordinates. Always `null` when
   *  `coordinates` is null. */
  locationLabel: z.string().nullable(),
  /** Public download URLs for the place's pictures (max 5). `images[0]` is
   *  the hero/cover shown in the detail scaffold. */
  images: z.array(z.string()).max(5),
  createdAt: z.date(),
  proposedBy: z.string().nullable(),
  ...contributorFields,
  // Denormalized interaction counters, maintained server-side by the comments
  // Cloud Function trigger / the detail-screen view tracker. Initialized to 0
  // at create.
  commentCount: z.number().int(),
  readCount: z.number().int(),
  // Counter denormalized from persons/{personId}.burialPlace by
  // functions/src/village/syncPlaceBurialCount.ts.
  burialCount: z.number().int(),
  ...visibilityFields,
});
export type PlaceData = z.infer<typeof PlaceDataSchema>;

export interface PlaceDataInput {
  name: string;
  kind: PlaceKind;
  municipalityId: string;
  description?: string | null;
  coordinates?: LatLng | null;
  locationLabel?: string | null;
  images?: string[];
  proposedBy?: string | null;
  contributorUserIds?: string[];
  contributorOrgIds?: string[];
}

export function buildPlaceData(input: PlaceDataInput): PlaceData {
  return {
    name: input.name,
    kind: input.kind,
    municipalityId: input.municipalityId,
    description: input.description ?? null,
    coordinates: input.coordinates ?? null,
    // A label without a coordinate would be an orphan string the UI can't act
    // on (no map, no directions), so the pin is what makes the name meaningful.
    locationLabel: input.coordinates ? (input.locationLabel ?? null) : null,
    images: input.images ?? [],
    createdAt: new Date(),
    proposedBy: input.proposedBy ?? null,
    contributorUserIds: input.contributorUserIds ?? [],
    contributorOrgIds: input.contributorOrgIds ?? [],
    commentCount: 0,
    readCount: 0,
    burialCount: 0,
    ...defaultVisibility(),
  };
}

/**
 * The pure half of fetch-settlements.mjs: how Overpass's flat `foreach` output
 * becomes municipality → settlements. Split out so the tag filter — the part
 * that decides what counts as a place people live — is unit-tested without
 * hitting Overpass. See scripts/__tests__/fetch-settlements.test.mjs.
 */

// ── What counts as a settlement ──────────────────────────────────────────────
//
// The tag filter is the load-bearing part of this script. Figueruela de Arriba
// has 260 `place` nodes and only 7 of them are settlements; the other 253 are
// `place=locality` — hilltops, streams, field names (Peña las Carreras, Alto de
// Fanales, Cruz de la Encrucijada). Nobody lives in them, and importing them
// would bury the real villages in toponyms.
//
// - city/town/village/hamlet → entidad singular (a pueblo/pedanía/lugar)
// - suburb/quarter/neighbourhood → barrio (a neighbourhood *within* a pueblo)
// - locality → EXCLUDED, uninhabited
// - isolated_dwelling → EXCLUDED, that is INE's "diseminado"
export const SETTLEMENT_PLACES = ['city', 'town', 'village', 'hamlet'];
export const NEIGHBOURHOOD_PLACES = ['suburb', 'quarter', 'neighbourhood'];

const round5 = (v) => (typeof v === 'number' ? Math.round(v * 1e5) / 1e5 : null);

/** OSM `place` value → our `kind`. */
export function kindForPlace(place) {
  if (SETTLEMENT_PLACES.includes(place)) return 'pedania';
  if (NEIGHBOURHOOD_PLACES.includes(place)) return 'barrio';
  return null;
}

// OSM tags the INE code inconsistently across regions; try each.
const INE_TAGS = ['ine:municipio', 'ref:ine', 'ine'];

function ineOf(tags) {
  for (const key of INE_TAGS) {
    const value = tags[key];
    if (typeof value === 'string' && /^\d{5}$/.test(value)) return value;
  }
  return null;
}

/**
 * Walk the flat `foreach` output back into municipality → settlements.
 *
 * Order is load-bearing: every relation starts a new municipality and the nodes
 * that follow belong to it, which is exactly what `foreach` guarantees.
 */
export function group(elements, nameByIne, ineByName) {
  const out = [];
  let current = null;
  let seatIds = new Set();
  const unmatched = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    if (el.type === 'relation' && tags.admin_level === '9') {
      // Galicia and Asturias: the entidad colectiva. Culturally the primary
      // unit of identity there — "son de Samarugo" names a parroquia.
      if (current && tags.name) {
        current.settlements.push({
          name: tags.name,
          kind: 'parroquia',
          isSeat: false,
          lat: round5(el.center?.lat),
          lng: round5(el.center?.lon),
        });
      }
      continue;
    }
    if (el.type === 'relation') {
      // Prefer the INE tag; fall back to the name. Lugo carries the tag on 67
      // of 67, but coverage is not guaranteed everywhere and the ciudades
      // autónomas relations carry none at all.
      const ine = ineOf(tags) ?? ineByName.get(tags.name ?? '') ?? null;
      current =
        ine && nameByIne.has(ine)
          ? { codigoINE: ine, name: nameByIne.get(ine), settlements: [] }
          : null;
      if (current) out.push(current);
      else if (tags.name) unmatched.push(tags.name);
      seatIds = new Set();
      continue;
    }
    // A node with no tags is the relation's admin_centre marker, emitted by
    // `out ids` just after its relation.
    if (el.type === 'node' && !el.tags) {
      seatIds.add(el.id);
      continue;
    }
    if (!current || !tags.name) continue;
    const kind = kindForPlace(tags.place);
    if (!kind) continue;
    current.settlements.push({
      name: tags.name,
      kind,
      // The seat needs a row of its own or residents of the main village have
      // nowhere to live while residents of the pedanías do — `residentCount`
      // and the censo would be asymmetric. INE agrees it is an entidad singular.
      //
      // OSM's `admin_centre` member is authoritative and frequently is NOT the
      // municipality's name: Aramaio's seat is a village called Ibarra. Name
      // matching alone also misses every municipality we store under its
      // Spanish exonym while OSM uses the co-official name (Alegría de Álava /
      // Alegría-Dulantzi), which was 1,639 of 8,167.
      isSeat: kind === 'pedania' && (seatIds.has(el.id) || tags.name === current.name),
      // 5 decimals is ~1m — far more precision than a village pin needs, and
      // full float precision alone added megabytes across 93k rows.
      lat: round5(el.lat ?? el.center?.lat),
      lng: round5(el.lon ?? el.center?.lon),
    });
  }
  if (unmatched.length) {
    console.log(`      ${unmatched.length} OSM municipalities matched no INE code, e.g. ${unmatched.slice(0, 3).join(', ')}`);
  }
  return out;
}

// Galicia (A Coruña, Lugo, Ourense, Pontevedra) and Asturias, by INE province
// prefix. These are the only regions where the entidad colectiva — the
// *parroquia* — is a real level of local identity.
const PARISH_PROVINCES = new Set(['15', '27', '32', '36', '33']);

/**
 * A municipality whose settlements sit under parroquias calls them *aldeas*,
 * not pedanías.
 *
 * This started as a purely structural rule — "has admin_level=9 children" — on
 * the theory that it would catch Asturias for free without a province list. The
 * data says otherwise: OSM uses admin_level=9 for ANY sub-municipal division,
 * so the rule also caught Navarra's 53 concejos, Álava's 34, Catalonia's EMDs
 * and a long tail of entidades locales menores — about 200 municipalities that
 * would have been shown Galician vocabulary for a Basque or Catalan structure.
 *
 * So the province list is deliberate. Elsewhere the admin_level=9 rows are
 * dropped rather than mislabelled: those concejos and EMDs are settlements in
 * their own right and OSM already carries each of them as a place node, so
 * nothing is lost — Aramaio's fourteen concejos all arrive as place=hamlet.
 */
export function applyRegionalKind(entry) {
  const isParishRegion = PARISH_PROVINCES.has(entry.codigoINE.slice(0, 2));
  if (!isParishRegion) {
    entry.settlements = entry.settlements.filter((s) => s.kind !== 'parroquia');
    return entry;
  }
  if (!entry.settlements.some((s) => s.kind === 'parroquia')) return entry;
  for (const s of entry.settlements) {
    if (s.kind === 'pedania') s.kind = 'aldea';
  }
  return entry;
}

export function dedupe(entry) {
  const seen = new Set();
  entry.settlements = entry.settlements.filter((s) => {
    const key = `${s.kind}:${s.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // Seat first, then alphabetical — the order the UI renders.
  // A municipality has exactly one seat. Both signals can fire at once — the
  // admin_centre node, and a separate node that happens to carry the
  // municipality's name — which would otherwise flag two rows.
  let seatSeen = false;
  for (const s of entry.settlements) {
    if (!s.isSeat) continue;
    if (seatSeen) s.isSeat = false;
    seatSeen = true;
  }

  // Seat first, then parroquias (the grouping level), then everything else.
  const rank = (s) => (s.isSeat ? 0 : s.kind === 'parroquia' ? 1 : 2);
  entry.settlements.sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name, 'es'));
  return entry;
}

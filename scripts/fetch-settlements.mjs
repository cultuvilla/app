#!/usr/bin/env node
/**
 * fetch-settlements.mjs
 *
 * Builds scripts/data/settlements-es.json — every inhabited place inside every
 * Spanish municipality, from OpenStreetMap via Overpass.
 *
 * WHY
 *   Cultuvilla's searchable universe is the 8,167 INE municipios, but most
 *   Spanish villages are not municipios. Villarino de Manzanas is an entidad
 *   singular of Figueruela de Arriba; a resident searching for the place they
 *   actually live in found nothing. See
 *   docs/plans/ideas/spanish-settlement-dataset.md.
 *
 * WHY OSM AND NOT INE/IGN (decision D1)
 *   The authoritative gazetteers have no scriptable download: the IGN NGMEP
 *   direct archive 404s behind a JS session portal, and the INE Nomenclátor is
 *   an undocumented JSP form that returns a page shell to a scripted POST.
 *   Either would be a blob fetched by hand once and committed with no way to
 *   refresh it — a dataset that rots silently, with no test able to detect it.
 *   OSM is complete, re-fetchable, and carries coordinates. For Galicia the
 *   difference is 19 localities (Wikidata) against ~37,000 (OSM).
 *
 * LICENCE (decision D2)
 *   OSM is ODbL. The app ships "© OpenStreetMap contributors".
 *
 * SHAPE
 *   One entry per municipality, keyed by INE code, carrying its settlements:
 *
 *     {
 *       "codigoINE": "49069",
 *       "name": "Figueruela de Arriba",
 *       "settlements": [
 *         { "name": "Figueruela de Arriba", "kind": "pedania", "isSeat": true,
 *           "lat": 41.8, "lng": -6.4 },
 *         { "name": "Villarino de Manzanas", "kind": "pedania", "isSeat": false, ... }
 *       ]
 *     }
 *
 * USAGE
 *   node scripts/fetch-settlements.mjs                 # all 52 provinces
 *   node scripts/fetch-settlements.mjs --province=49   # just one
 *   node scripts/fetch-settlements.mjs --dry-run       # report, write nothing
 *
 *   The run is RESUMABLE: each province is written to a per-province cache file
 *   under scripts/data/.settlements-cache/ as it completes, and a re-run skips
 *   provinces already cached. Overpass rate-limits hard, so a full run takes
 *   hours and will be interrupted; losing it all would make this script
 *   unusable in practice.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  SETTLEMENT_PLACES,
  NEIGHBOURHOOD_PLACES,
  group,
  applyRegionalKind,
  dedupe,
} from './lib/settlements.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUNI_PATH = path.join(__dirname, 'data', 'municipalities-es.json');
const OUT_PATH = path.join(__dirname, 'data', 'settlements-es.json');
const CACHE_DIR = path.join(__dirname, 'data', '.settlements-cache');
const USER_AGENT =
  'cultuvilla-settlement-fetcher/0.1 (https://github.com/cultuvilla/app)';
const ENDPOINT = 'https://overpass-api.de/api/interpreter';

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const ONLY_PROVINCE = args.find((a) => a.startsWith('--province='))?.split('=')[1];

// INE province code (first 2 digits) → ISO 3166-2 subdivision code, which is
// how OSM tags a province boundary. Overpass needs the ISO code to scope the
// query to a province; filtering on `ine:municipio` directly is an unbounded
// tag search over the whole planet and gets rejected.
const ISO_BY_INE_PREFIX = {
  '01': 'VI', '02': 'AB', '03': 'A',  '04': 'AL', '05': 'AV', '06': 'BA',
  '07': 'PM', '08': 'B',  '09': 'BU', '10': 'CC', '11': 'CA', '12': 'CS',
  '13': 'CR', '14': 'CO', '15': 'C',  '16': 'CU', '17': 'GI', '18': 'GR',
  '19': 'GU', '20': 'SS', '21': 'H',  '22': 'HU', '23': 'J',  '24': 'LE',
  '25': 'L',  '26': 'LO', '27': 'LU', '28': 'M',  '29': 'MA', '30': 'MU',
  '31': 'NA', '32': 'OR', '33': 'O',  '34': 'P',  '35': 'GC', '36': 'PO',
  '37': 'SA', '38': 'TF', '39': 'S',  '40': 'SG', '41': 'SE', '42': 'SO',
  '43': 'T',  '44': 'TE', '45': 'TO', '46': 'V',  '47': 'VA', '48': 'BI',
  '49': 'ZA', '50': 'Z',  '51': 'CE', '52': 'ML',
};

// Ceuta and Melilla are ciudades autónomas: OSM has them only as an
// admin_level=4 relation, with no admin_level=8 municipality inside. Scoping
// the normal way finds nothing, which the empty-result guard correctly refuses
// to cache. Treat the level-4 relation as the municipality for those two.
const MUNICIPALITY_LEVEL = { '51': 4, '52': 4 };
const DEFAULT_MUNICIPALITY_LEVEL = 8;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function query(provincePrefix) {
  const iso = ISO_BY_INE_PREFIX[provincePrefix];
  if (!iso) throw new Error(`No ISO 3166-2 code for INE province ${provincePrefix}`);
  const places = [...SETTLEMENT_PLACES, ...NEIGHBOURHOOD_PLACES].join('|');
  const level = MUNICIPALITY_LEVEL[provincePrefix] ?? DEFAULT_MUNICIPALITY_LEVEL;
  // `foreach` emits each municipality relation followed by the place nodes
  // inside it, so one request per province yields the full grouping. Doing it
  // per municipality instead would be 8,167 requests.
  const municipalities =
    level === DEFAULT_MUNICIPALITY_LEVEL
      ? `area["ISO3166-2"="ES-${iso}"][admin_level=6]->.p;\nrel(area.p)["admin_level"="8"];`
      : `rel["ISO3166-2"="ES-${iso}"]["admin_level"="${level}"];`;
  // Inside the loop the admin_centre member is emitted as a BARE id (`out ids`,
  // no tags) and the place nodes with tags, so the two are told apart by
  // whether `tags` is present — no positional guessing.
  return `
[out:json][timeout:900];
${municipalities}
foreach(
  ._->.rel;
  .rel out tags;
  node(r.rel:"admin_centre"); out ids;
  .rel map_to_area->.m;
  rel(area.m)["admin_level"="9"]; out tags center;
  node(area.m)["place"~"^(${places})$"];
  out tags center;
);`.trim();
}

/**
 * Overpass fails three distinct ways under load and all three must be retried:
 * a 504/502, a 429 rate-limit, and — the nasty one — a truncated body served
 * with a 200, which surfaces as a JSON parse error rather than an HTTP error.
 */
async function fetchProvince(prefix, attempts = 6) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ data: query(prefix) }),
      });
      if (res.status === 429 || res.status === 504 || res.status === 502) {
        throw new Error(`HTTP ${res.status}`);
      }
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return JSON.parse(await res.text()).elements;
    } catch (err) {
      if (attempt === attempts) throw err;
      const backoff = Math.min(120000, 10000 * 2 ** (attempt - 1));
      console.log(`    province ${prefix}: ${err.message} — retrying in ${backoff / 1000}s`);
      await sleep(backoff);
    }
  }
}

async function main() {
  const municipalities = JSON.parse(readFileSync(MUNI_PATH, 'utf8'));
  const nameByIne = new Map(municipalities.map((m) => [m.codigoINE, m.name]));
  const ineByName = new Map(municipalities.map((m) => [m.name, m.codigoINE]));
  console.log(`Loaded ${municipalities.length} municipalities`);

  const prefixes = ONLY_PROVINCE
    ? [ONLY_PROVINCE]
    : [...new Set(municipalities.map((m) => m.codigoINE.slice(0, 2)))].sort();

  if (!existsSync(CACHE_DIR)) mkdirSync(CACHE_DIR, { recursive: true });

  for (const [i, prefix] of prefixes.entries()) {
    const cachePath = path.join(CACHE_DIR, `${prefix}.json`);
    if (existsSync(cachePath)) {
      console.log(`  [${i + 1}/${prefixes.length}] province ${prefix}: cached, skipping`);
      continue;
    }
    const elements = await fetchProvince(prefix);
    const grouped = group(elements, nameByIne, ineByName)
      .map(applyRegionalKind)
      .map(dedupe);
    const total = grouped.reduce((n, e) => n + e.settlements.length, 0);
    if (grouped.length === 0) {
      throw new Error(
        `province ${prefix} (ES-${ISO_BY_INE_PREFIX[prefix]}) matched no municipalities — ` +
          `refusing to cache an empty result, which a re-run would trust`,
      );
    }
    writeFileSync(cachePath, JSON.stringify(grouped, null, 2));
    console.log(
      `  [${i + 1}/${prefixes.length}] province ${prefix}: ` +
        `${grouped.length} municipios, ${total} settlements`,
    );
    await sleep(3000);
  }

  // ── Assemble ───────────────────────────────────────────────────────────────
  const byIne = new Map();
  for (const file of readdirSync(CACHE_DIR).filter((f) => f.endsWith('.json'))) {
    for (const entry of JSON.parse(readFileSync(path.join(CACHE_DIR, file), 'utf8'))) {
      byIne.set(entry.codigoINE, entry);
    }
  }

  // Every municipality gets an entry, even an empty one, so a consumer never has
  // to distinguish "not fetched" from "genuinely has no sub-settlements".
  const entries = municipalities.map(
    (m) => byIne.get(m.codigoINE) ?? { codigoINE: m.codigoINE, name: m.name, settlements: [] },
  );

  const withAny = entries.filter((e) => e.settlements.length > 0);
  const totals = { pedania: 0, aldea: 0, parroquia: 0, barrio: 0, seats: 0 };
  for (const e of entries) {
    for (const s of e.settlements) {
      totals[s.kind]++;
      if (s.isSeat) totals.seats++;
    }
  }

  const missingSeat = entries.filter(
    (e) => e.settlements.length > 0 && !e.settlements.some((s) => s.isSeat),
  );
  console.log(
    `\n${withAny.length} of ${entries.length} municipalities carry settlements.\n` +
      `  localidades (pedanías):  ${totals.pedania}\n` +
      `  aldeas (Galicia/Ast.):   ${totals.aldea}\n` +
      `  parroquias:              ${totals.parroquia}\n` +
      `  barrios:                 ${totals.barrio}\n` +
      `  seats identified:        ${totals.seats}` +
      (missingSeat.length ? ` (${missingSeat.length} municipalities have none)` : ''),
  );

  const figueruela = entries.find((e) => e.codigoINE === '49069');
  if (figueruela) {
    console.log(`\n  49069 ${figueruela.name}:`);
    for (const s of figueruela.settlements) {
      console.log(`    ${s.kind.padEnd(8)} ${s.isSeat ? '(seat) ' : '       '}${s.name}`);
    }
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: not writing JSON.');
    return;
  }
  writeFileSync(OUT_PATH, JSON.stringify(entries) + '\n');
  console.log(`\nWrote ${entries.length} entries → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

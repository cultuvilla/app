#!/usr/bin/env node
/**
 * enrich-municipality-aliases.mjs
 *
 * Adds `nameAliases` — the co-official-language names — to every entry in
 * scripts/data/municipalities-es.json, in place.
 *
 * WHY
 *   The dataset carries Wikidata's *Spanish* label, which for bilingual regions
 *   is the exonym: "San Sebastián", "Lérida", "La Coruña", "Alicante". Village
 *   search only ever matched that string, so a Basque, Catalan or Galician
 *   speaker searching for their own pueblo by the name they actually use
 *   ("Donostia", "Lleida", "A Coruña", "Elx") found nothing at all.
 *
 * WHY IT IS SEPARATE FROM fetch-municipalities.mjs
 *   That script's query walks P31/P279* to find every municipality subclass,
 *   which is expensive enough that WDQS routinely 504s on it. Alias lookup
 *   needs no traversal — it joins on P772, which has only ~8k subjects — so
 *   keeping it separate means a flaky class query can't block an alias refresh,
 *   and vice versa. Run fetch-municipalities.mjs first (it owns which
 *   municipalities exist), then this (it owns what they are also called).
 *
 * USAGE
 *   node scripts/enrich-municipality-aliases.mjs            # rewrites the JSON
 *   node scripts/enrich-municipality-aliases.mjs --dry-run  # report only
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'data', 'municipalities-es.json');
const USER_AGENT =
  'cultuvilla-municipality-fetcher/0.1 (https://github.com/cultuvilla/app)';

const DRY_RUN = process.argv.slice(2).includes('--dry-run');

// Spain's co-official languages, plus the two regional ones Wikidata carries
// consistently (Asturian, Aragonese) and Occitan for Val d'Aran.
const ALIAS_LANGUAGES = ['es', 'eu', 'ca', 'gl', 'ast', 'an', 'oc'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Mirrors municipalitySearchKey in packages/shared. */
function searchKey(name) {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

function sparqlForProvince(prefix) {
  return `
SELECT ?ine ?l WHERE {
  ?m wdt:P772 ?ine .
  FILTER(STRSTARTS(?ine, "${prefix}"))
  ?m rdfs:label ?l .
  FILTER(LANG(?l) IN (${ALIAS_LANGUAGES.map((l) => `"${l}"`).join(', ')}))
}`.trim();
}

// WDQS truncates response bodies under load, which surfaces as a JSON parse
// error on a 200 rather than an HTTP failure — so retry on parse errors too.
async function fetchProvince(prefix, attempts = 4) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch('https://query.wikidata.org/sparql', {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/sparql-results+json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ query: sparqlForProvince(prefix) }),
      });
      if (!res.ok) throw new Error(`SPARQL ${res.status} ${res.statusText}`);
      return JSON.parse(await res.text()).results.bindings;
    } catch (err) {
      if (attempt === attempts) throw err;
      await sleep(attempt * 4000);
    }
  }
}

async function main() {
  /** @type {Array<{ name: string, codigoINE: string, nameAliases?: string[] }>} */
  const entries = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  console.log(`Loaded ${entries.length} municipalities from ${path.basename(DATA_PATH)}`);

  const prefixes = [...new Set(entries.map((e) => e.codigoINE.slice(0, 2)))].sort();
  /** INE code → Set of candidate names in any language. */
  const labelsByIne = new Map();

  for (const [i, prefix] of prefixes.entries()) {
    const rows = await fetchProvince(prefix);
    for (const row of rows) {
      const ine = row.ine.value;
      if (!labelsByIne.has(ine)) labelsByIne.set(ine, new Set());
      labelsByIne.get(ine).add(row.l.value);
    }
    console.log(`  [${i + 1}/${prefixes.length}] province ${prefix}: ${rows.length} labels`);
    await sleep(250);
  }

  let withAliases = 0;
  let totalAliases = 0;
  for (const entry of entries) {
    const candidates = labelsByIne.get(entry.codigoINE) ?? new Set();
    // An alias that normalizes to the Spanish name is not an alias — search is
    // accent-stripped, so "Malaga" for "Málaga" buys nothing and only inflates
    // the prefix index. Keep only genuinely different names.
    const seen = new Set([searchKey(entry.name)]);
    const aliases = [];
    for (const candidate of [...candidates].sort()) {
      const key = searchKey(candidate);
      if (seen.has(key)) continue;
      seen.add(key);
      aliases.push(candidate);
    }
    entry.nameAliases = aliases;
    if (aliases.length) {
      withAliases++;
      totalAliases += aliases.length;
    }
  }

  console.log(
    `\n${withAliases} of ${entries.length} municipalities carry a co-official name ` +
      `(${totalAliases} aliases total).`,
  );
  const samples = entries.filter((e) => e.nameAliases.length).slice(0, 10);
  for (const e of samples) {
    console.log(`  ${e.codigoINE}  ${e.name.padEnd(28)} → ${e.nameAliases.join(', ')}`);
  }

  if (DRY_RUN) {
    console.log('\n--dry-run: not writing JSON.');
    return;
  }

  writeFileSync(DATA_PATH, JSON.stringify(entries, null, 2) + '\n');
  console.log(`\nWrote ${entries.length} entries → ${DATA_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

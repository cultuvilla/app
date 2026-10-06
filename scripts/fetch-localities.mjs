#!/usr/bin/env node
/**
 * fetch-localities.mjs
 *
 * Adds `localityNames` — the entidades singulares de población (pedanías,
 * anejos, aldeas, barrios históricos) that sit *inside* each municipality — to
 * every entry in scripts/data/municipalities-es.json, in place.
 *
 * WHY
 *   Cultuvilla's searchable universe is the 8,167 INE municipios. Most Spanish
 *   villages are not municipios: Villarino de Manzanas is an entidad singular
 *   of Figueruela de Arriba, so a resident searching for the name of the place
 *   they actually live in got nothing, and reasonably concluded their pueblo
 *   was missing. These names are folded into the municipality's own search
 *   index, so typing the pedanía finds the municipio that contains it.
 *
 * WHY NOT A SEPARATE COLLECTION
 *   A locality has no independent life in this product — you cannot join one,
 *   post to one, or administer one; it exists only to lead you to its
 *   municipio. Storing it as an alias of the municipality reuses the whole
 *   `searchPrefixes` mechanism (one predicate, one index, one drift test) and
 *   adds no collection, service, rule or query shape.
 *
 * WHY WIKIDATA AND NOT INE/IGN
 *   The authoritative gazetteers have no scriptable download. The IGN NGMEP
 *   direct archive 404s and its portal is a JS session; the INE Nomenclátor is
 *   an undocumented JSP form that returns a page shell to a scripted POST.
 *   Either would be a blob fetched by hand once and committed with no way to
 *   refresh it. Wikidata is the same source and the same tooling as the
 *   municipality dataset itself, so this file stays reproducible — which is
 *   what stops it from rotting silently.
 *
 * USAGE
 *   node scripts/fetch-localities.mjs            # rewrites the JSON
 *   node scripts/fetch-localities.mjs --dry-run  # report only
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_PATH = path.join(__dirname, 'data', 'municipalities-es.json');
const USER_AGENT =
  'cultuvilla-municipality-fetcher/0.1 (https://github.com/cultuvilla/app)';

const DRY_RUN = process.argv.slice(2).includes('--dry-run');

// Q3055118 "entidad singular de población" is the INE-aligned class. The two
// sibling classes below are how Wikidata types the same real thing in some
// regions; without them whole provinces come back thin.
const LOCALITY_CLASSES = ['wd:Q3055118', 'wd:Q2724116', 'wd:Q1907114'];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function sparqlForProvince(prefix) {
  return `
SELECT DISTINCT ?n ?ine WHERE {
  VALUES ?cls { ${LOCALITY_CLASSES.join(' ')} }
  ?e wdt:P31 ?cls ; wdt:P131+ ?m ; rdfs:label ?n .
  ?m wdt:P772 ?ine .
  FILTER(STRSTARTS(?ine, "${prefix}"))
  FILTER(LANG(?n) = "es")
}`.trim();
}

/**
 * WDQS fails three distinct ways under load, and all three have to be retried:
 * a 504/502, a 429 rate-limit, and — the nasty one — a truncated body served
 * with a 200, which surfaces as a JSON parse error rather than an HTTP error.
 * The backoff is deliberately generous; this script runs rarely.
 */
async function fetchProvince(prefix, attempts = 6) {
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
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after') ?? 0);
        throw new Error(`rate limited (retry-after ${retryAfter || 'unset'})`);
      }
      if (!res.ok) throw new Error(`SPARQL ${res.status} ${res.statusText}`);
      return JSON.parse(await res.text()).results.bindings;
    } catch (err) {
      if (attempt === attempts) throw err;
      const backoff = Math.min(60000, 5000 * 2 ** (attempt - 1));
      console.log(`    province ${prefix}: ${err.message}; retrying in ${backoff / 1000}s`);
      await sleep(backoff);
    }
  }
}

async function main() {
  const entries = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
  console.log(`Loaded ${entries.length} municipalities`);

  const prefixes = [...new Set(entries.map((e) => e.codigoINE.slice(0, 2)))].sort();
  /** INE code → Set of locality names inside that municipality. */
  const byIne = new Map();

  for (const [i, prefix] of prefixes.entries()) {
    const rows = await fetchProvince(prefix);
    for (const row of rows) {
      const ine = row.ine.value;
      if (!byIne.has(ine)) byIne.set(ine, new Set());
      byIne.get(ine).add(row.n.value);
    }
    console.log(`  [${i + 1}/${prefixes.length}] province ${prefix}: ${rows.length} localities`);
    await sleep(2000);
  }

  let withLocalities = 0;
  let total = 0;
  for (const entry of entries) {
    const names = byIne.get(entry.codigoINE) ?? new Set();
    // The municipality's own name is almost always also one of its entidades
    // singulares. Keeping it would duplicate every prefix the name already
    // contributes, for nothing.
    names.delete(entry.name);
    entry.localityNames = [...names].sort();
    if (entry.localityNames.length) {
      withLocalities++;
      total += entry.localityNames.length;
    }
  }

  console.log(
    `\n${withLocalities} of ${entries.length} municipalities carry localities ` +
      `(${total} localities total).`,
  );
  const figueruela = entries.find((e) => e.codigoINE === '49069');
  if (figueruela) {
    console.log(`  49069 ${figueruela.name} → ${figueruela.localityNames.join(', ') || '(none)'}`);
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

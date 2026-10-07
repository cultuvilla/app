#!/usr/bin/env node
/**
 * fetch-escudos.mjs
 *
 * Downloads coats of arms ("escudos") for Spanish municipalities from
 * Wikimedia Commons via Wikidata. Writes files to scripts/data/escudos/
 * named by INE code: {codigoINE}.{ext}
 *
 * This script does NOT touch Firebase. It only writes to the local
 * filesystem. A separate upload step will run later once we've inspected
 * size + coverage.
 *
 * USAGE
 *   node scripts/fetch-escudos.mjs            # full run (~8k items)
 *   node scripts/fetch-escudos.mjs --limit 50 # quick sample
 *   node scripts/fetch-escudos.mjs --dry-run  # query Wikidata only, no downloads
 *
 * COVERAGE
 *   Wikidata only has coats of arms (P94) for a subset of Spanish
 *   municipalities. Expect somewhere between 60-80% coverage. The script
 *   reports the gap at the end.
 *
 * RATE LIMITING
 *   Commons throttles Special:FilePath aggressively. We use concurrency=2
 *   with exponential backoff on 429. The SPARQL query is one request total.
 */

import { mkdir, writeFile, stat, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, 'data', 'escudos');
const USER_AGENT = 'cultuvilla-escudo-fetcher/0.1 (https://github.com/cultuvilla/app)';
const CONCURRENCY = 2;
const MAX_RETRIES = 5;

// ── Args ──────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const limitIdx = args.indexOf('--limit');
const LIMIT = limitIdx >= 0 ? Number.parseInt(args[limitIdx + 1] ?? '0', 10) : 0;
// --ine 40123,28079 → download only these INE codes (targeted refresh for a
// few villages instead of the ~8k full crawl).
const ineIdx = args.indexOf('--ine');
const INE_FILTER =
  ineIdx >= 0
    ? new Set((args[ineIdx + 1] ?? '').split(',').map((s) => s.trim()).filter(Boolean))
    : null;

// ── SPARQL ────────────────────────────────────────────────────────────────────

// Spanish municipalities (Q2074737) with both a coat of arms (P94) and INE code (P772).
const SPARQL = `
SELECT ?muni ?muniLabel ?ine ?image WHERE {
  ?muni wdt:P31 wd:Q2074737 .
  ?muni wdt:P772 ?ine .
  ?muni wdt:P94 ?image .
  SERVICE wikibase:label { bd:serviceParam wikibase:language "es,en". }
}
`.trim();

async function fetchSparql() {
  const url = 'https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(SPARQL);
  const res = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/sparql-results+json' },
  });
  if (!res.ok) {
    throw new Error(`SPARQL ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  return json.results.bindings.map(b => ({
    ine: b.ine.value,
    name: b.muniLabel?.value ?? '',
    qid: b.muni.value.split('/').pop(),
    imageUrl: b.image.value, // e.g. http://commons.wikimedia.org/wiki/Special:FilePath/Foo.svg
  }));
}

// ── Download ─────────────────────────────────────────────────────────────────

function extFromUrl(u) {
  const decoded = decodeURIComponent(u);
  const m = decoded.match(/\.([a-zA-Z0-9]{3,4})(?:$|\?)/);
  return (m?.[1] ?? 'bin').toLowerCase();
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function downloadOne(item, existing) {
  const ext = extFromUrl(item.imageUrl);
  const filename = `${item.ine}.${ext}`;
  if (existing.has(filename)) {
    return { status: 'skip', filename, bytes: 0 };
  }
  let lastErr = '';
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(item.imageUrl, {
        headers: { 'User-Agent': USER_AGENT },
        redirect: 'follow',
        signal: AbortSignal.timeout(60000),
      });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        await writeFile(path.join(OUT_DIR, filename), buf);
        return { status: 'ok', filename, bytes: buf.length };
      }
      if (res.status === 429 || res.status >= 500) {
        const retryAfter = Number.parseInt(res.headers.get('retry-after') ?? '0', 10);
        const backoff = retryAfter > 0 ? retryAfter * 1000 : Math.min(30000, 1000 * 2 ** attempt);
        lastErr = `HTTP ${res.status} (retry in ${backoff}ms)`;
        await sleep(backoff);
        continue;
      }
      return { status: 'fail', filename, bytes: 0, error: `HTTP ${res.status}` };
    } catch (err) {
      lastErr = String(err?.message ?? err);
      const backoff = Math.min(30000, 1000 * 2 ** attempt);
      await sleep(backoff);
    }
  }
  return { status: 'fail', filename, bytes: 0, error: lastErr || 'max retries' };
}

async function pool(items, concurrency, worker) {
  const results = [];
  let i = 0;
  const runners = Array.from({ length: concurrency }, async () => {
    while (i < items.length) {
      const idx = i++;
      try {
        results.push(await worker(items[idx], idx));
      } catch (err) {
        results.push({ status: 'fail', error: String(err) });
      }
    }
  });
  await Promise.all(runners);
  return results;
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  const existing = new Set(existsSync(OUT_DIR) ? await readdir(OUT_DIR) : []);

  console.log('Querying Wikidata for Spanish municipalities with coats of arms...');
  const all = await fetchSparql();
  console.log(`  Wikidata returned ${all.length} municipalities with both INE code and P94 image.`);

  // Dedupe by INE (some munis have multiple images listed)
  const byIne = new Map();
  for (const item of all) {
    if (!byIne.has(item.ine)) byIne.set(item.ine, item);
  }
  let items = [...byIne.values()];
  console.log(`  After dedupe by INE: ${items.length} unique municipalities.`);

  if (INE_FILTER) {
    items = items.filter((it) => INE_FILTER.has(it.ine));
    const missing = [...INE_FILTER].filter((ine) => !byIne.has(ine));
    console.log(`  --ine applied: ${items.length} match(es).`);
    if (missing.length) {
      console.log(`  No Wikidata coat of arms (P94) for INE: ${missing.join(', ')}.`);
    }
  }

  if (LIMIT > 0) {
    items = items.slice(0, LIMIT);
    console.log(`  --limit ${LIMIT} applied: downloading first ${items.length}.`);
  }

  // Spain has ~8,131 municipalities total.
  const TOTAL_SPAIN = 8131;
  const coverage = ((items.length / TOTAL_SPAIN) * 100).toFixed(1);
  console.log(`  Coverage: ${items.length} / ~${TOTAL_SPAIN} municipios (${coverage}%).`);

  if (DRY_RUN) {
    console.log('\n--dry-run: skipping downloads. Sample:');
    for (const item of items.slice(0, 5)) {
      console.log(`  ${item.ine}  ${item.name.padEnd(30)}  ${item.imageUrl}`);
    }
    return;
  }

  console.log(`\nDownloading to ${OUT_DIR} (concurrency=${CONCURRENCY})...`);
  const t0 = Date.now();
  let done = 0;
  const results = await pool(items, CONCURRENCY, async item => {
    const r = await downloadOne(item, existing);
    done++;
    if (done % 100 === 0 || done === items.length) {
      const pct = ((done / items.length) * 100).toFixed(1);
      process.stdout.write(`  ${done}/${items.length} (${pct}%)\r`);
    }
    return r;
  });
  process.stdout.write('\n');

  const ok = results.filter(r => r.status === 'ok');
  const skip = results.filter(r => r.status === 'skip');
  const fail = results.filter(r => r.status === 'fail');
  const totalBytes = ok.reduce((sum, r) => sum + r.bytes, 0);

  console.log(`\nDone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log(`  Downloaded: ${ok.length}  (${fmtBytes(totalBytes)} on disk)`);
  console.log(`  Skipped (already present): ${skip.length}`);
  console.log(`  Failed: ${fail.length}`);
  if (fail.length > 0) {
    console.log('  First 5 failures:');
    for (const f of fail.slice(0, 5)) {
      console.log(`    ${f.filename ?? '?'}: ${f.error}`);
    }
  }

  // Breakdown by extension
  const byExt = new Map();
  for (const r of ok) {
    const ext = r.filename.split('.').pop();
    const cur = byExt.get(ext) ?? { count: 0, bytes: 0 };
    cur.count++;
    cur.bytes += r.bytes;
    byExt.set(ext, cur);
  }
  if (byExt.size > 0) {
    console.log('\n  By format:');
    for (const [ext, { count, bytes }] of [...byExt.entries()].sort((a, b) => b[1].bytes - a[1].bytes)) {
      console.log(`    .${ext.padEnd(5)} ${String(count).padStart(5)} files, ${fmtBytes(bytes)}`);
    }
  }

  console.log(`\nNext: inspect ${OUT_DIR}, then run optimization (svgo + sharp) before deciding to upload.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

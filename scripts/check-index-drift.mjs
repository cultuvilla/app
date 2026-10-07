#!/usr/bin/env node
/**
 * Compare a project's live composite indexes against firestore.indexes.json.
 *
 * WHY THIS EXISTS. CI deploys indexes with `--force`, so the file is the only
 * source of truth: an index created by hand in the console (a hotfix while a
 * query was failing) is deleted by the next deploy. Run before that deploy, this
 * names exactly what `--force` will delete; run after it, it proves live == file.
 * See docs/plans/ongoing/firestore-index-hygiene.md.
 *
 *   node scripts/check-index-drift.mjs --project=<alias|id> [--warn]
 *   node scripts/check-index-drift.mjs --live=<file.json>  [--warn]
 *
 * `--project` shells out to `firebase firestore:indexes` (set FIREBASE_BIN to
 * use `bash scripts/firebase.sh` locally). `--live` reads that command's output
 * from a file. Exits 1 on drift, or 0 with a GitHub `::warning::` under `--warn`.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Firestore appends `__name__` to some indexes on its own; the file never
// declares it, so it is not drift.
export function indexKey(index) {
  const fields = (index.fields ?? [])
    .filter((f) => f.fieldPath !== '__name__')
    .map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig ?? JSON.stringify(f.vectorConfig ?? null)}`);
  return `${index.collectionGroup}|${index.queryScope ?? 'COLLECTION'}|${fields.join(',')}`;
}

export function diffIndexes(declared, live) {
  const declaredKeys = new Set(declared.map(indexKey));
  const liveKeys = new Set(live.map(indexKey));
  return {
    orphans: [...liveKeys].filter((k) => !declaredKeys.has(k)).sort(),
    missing: [...declaredKeys].filter((k) => !liveKeys.has(k)).sort(),
  };
}

function parseArgs(argv) {
  const args = { warn: false };
  for (const arg of argv) {
    if (arg === '--warn') args.warn = true;
    else if (arg.startsWith('--project=')) args.project = arg.slice('--project='.length);
    else if (arg.startsWith('--live=')) args.live = arg.slice('--live='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.project === !args.live) throw new Error('Pass exactly one of --project=<alias|id> or --live=<file>.');
  return args;
}

function readLive({ project, live }) {
  if (live) return JSON.parse(readFileSync(live, 'utf8'));
  const [bin, ...pre] = (process.env.FIREBASE_BIN ?? 'firebase').split(' ');
  const out = execFileSync(bin, [...pre, 'firestore:indexes', '--project', project], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return JSON.parse(out);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const repoRoot = resolve(fileURLToPath(import.meta.url), '../..');
  const declared = JSON.parse(readFileSync(resolve(repoRoot, 'firestore.indexes.json'), 'utf8')).indexes;
  const live = readLive(args).indexes;
  const { orphans, missing } = diffIndexes(declared, live);

  const target = args.project ?? args.live;
  console.log(`${target}: ${live.length} live, ${declared.length} declared, ${orphans.length} orphaned, ${missing.length} missing`);
  for (const k of orphans) console.log(`  orphan   ${k}`);
  for (const k of missing) console.log(`  missing  ${k}`);
  if (orphans.length === 0 && missing.length === 0) return;

  const summary = `${orphans.length} live index(es) not in firestore.indexes.json, ${missing.length} declared but not live`;
  if (args.warn) {
    console.log(`::warning title=Firestore index drift::${summary} on ${target}. A --force deploy deletes the orphans; add any that are still needed to the file.`);
    return;
  }
  console.error(`Index drift on ${target}: ${summary}.`);
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}

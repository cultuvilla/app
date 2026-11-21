// Relates every named export under packages/shared/src/services/ to the tests
// that exercise it.
//
// Every service file had a test, yet 156 of 400 exports were named by none —
// write paths with real logic among them. This module is the measurement;
// packages/shared/test/ci/serviceTestCoverage.test.ts turns it into a ratchet:
// an export is either referenced by a test or listed in
// packages/shared/test/services/untested-exports.json, and that list may only
// shrink. After testing an export (or deleting one):
//
//   node scripts/lib/service-test-coverage.mjs --write
//
// "Referenced" is a name match outside comments, in packages/shared/test/** and
// functions/src/__tests__/**. Mobile and studio tests are left out on purpose:
// they jest.mock services, so naming an export there proves nothing.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const servicesDir = join(repoRoot, 'packages/shared/src/services');
export const listPath = join(repoRoot, 'packages/shared/test/services/untested-exports.json');
const TEST_ROOTS = ['packages/shared/test', 'functions/src/__tests__'].map((d) => join(repoRoot, d));

function walk(dir, keep) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(full, keep);
    return keep(e.name) ? [full] : [];
  });
}

/** Block and line comments blanked out, so an export named only in a comment doesn't count. */
export function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

const EXPORT = /^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm;

/** `{ 'eventService.ts': ['createEvent', …], 'observability/observabilityService.ts': [...] }` */
export function serviceExports(dir = servicesDir) {
  const out = {};
  const files = walk(dir, (n) => n.endsWith('.ts') && n !== 'index.ts' && !n.endsWith('.d.ts')).sort();
  for (const file of files) {
    const names = [...stripComments(readFileSync(file, 'utf8')).matchAll(EXPORT)].map((m) => m[1]);
    if (names.length) out[relative(dir, file)] = [...new Set(names)].sort();
  }
  return out;
}

/** Every identifier that appears in a test file outside a comment. */
export function testIdentifiers(roots = TEST_ROOTS) {
  const ids = new Set();
  for (const root of roots) {
    for (const file of walk(root, (n) => /\.(test|spec)\.tsx?$|\.ts$/.test(n))) {
      for (const m of stripComments(readFileSync(file, 'utf8')).matchAll(/[A-Za-z_$][\w$]*/g)) ids.add(m[0]);
    }
  }
  return ids;
}

/** Exports no test names, in the list's shape: file → sorted names. */
export function untestedExports(exports = serviceExports(), ids = testIdentifiers()) {
  const out = {};
  for (const [file, names] of Object.entries(exports)) {
    const missing = names.filter((n) => !ids.has(n));
    if (missing.length) out[file] = missing;
  }
  return out;
}

export function readList() {
  return JSON.parse(readFileSync(listPath, 'utf8'));
}

/** `file#name` keys, for set comparisons. */
export function keys(list) {
  return Object.entries(list).flatMap(([file, names]) => names.map((n) => `${file}#${n}`));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const found = untestedExports();
  if (process.argv.includes('--write')) {
    writeFileSync(listPath, `${JSON.stringify(found, null, 2)}\n`);
    console.log(`wrote ${keys(found).length} untested exports to ${relative(repoRoot, listPath)}`);
  } else {
    for (const k of keys(found)) console.log(k);
    console.log(`${keys(found).length} untested of ${keys(serviceExports()).length} exports`);
  }
}

// Relates the mobile app's testIDs to the native Maestro flows that touch them.
//
// The E2E suite was green while whole forms shipped untested: a flow walked the
// shortest path on defaults and nothing measured what it skipped. This module is
// the measurement — packages/shared/test/ci/e2eCoverage.test.ts turns it into a
// ratchet, and `node scripts/lib/e2e-coverage.mjs --write` regenerates the gap
// list after a flow covers more. See docs/plans/ongoing/e2e-full-feature-coverage.md.

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
export const mobileDir = join(repoRoot, 'apps/mobile');
export const nativeDir = join(mobileDir, 'e2e/native');
export const uncoveredPath = join(nativeDir, 'uncovered.json');

const SOURCE_DIRS = ['app', 'components', 'lib'];

function walk(dir, keep) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : walk(full, keep);
    return keep(e.name) ? [full] : [];
  });
}

const isSource = (name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !name.endsWith('.d.ts');

export function sourceFiles() {
  return SOURCE_DIRS.flatMap((d) => walk(join(mobileDir, d), isSource));
}

// `testID="x"`, `testID={'x'}`, `primaryTestID="x"`, `{ testID: 'x' }` → exact `x`.
// `` testID={`x-${id}`} `` → prefix `x-` (written `x-*`). A value with no literal
// head (`testID={testID}`, `` `${testID}-date` ``) is the caller's id plus a
// suffix and is accounted for at the call site.
// A `…TestIDPrefix` prop is the head of ids its component numbers (`news-block-text-0`).
const TEST_ID = /\b\w*[tT]est[Ii][Dd](\w*)\s*(?:=\s*\{?|:)\s*(['"`])((?:(?!\2)[^\\]|\\.)*)\2/g;
// `testID: i === 0 ? 'register-fab' : 'register-fab-waitlist'`
const TERNARY = /\b\w*[tT]est[Ii][Dd]\w*\s*(?:=\s*\{|:)[^?\n]*\?\s*(['"])([^'"]+)\1\s*:\s*(['"])([^'"]+)\3/g;

/** @returns {Map<string, { prefix: boolean, files: Set<string> }>} keyed `x` or `x-*` */
export function sourceTestIds(files = sourceFiles()) {
  const ids = new Map();
  for (const file of files) {
    const text = readFileSync(file, 'utf8');
    const add = (head, prefix) => {
      if (!/^[A-Za-z]/.test(head)) return;
      const key = prefix ? `${head}*` : head;
      const entry = ids.get(key) ?? { prefix, files: new Set() };
      entry.files.add(relative(repoRoot, file));
      ids.set(key, entry);
    };
    for (const m of text.matchAll(TEST_ID)) {
      const raw = m[3];
      const hole = m[2] === '`' ? raw.indexOf('${') : -1;
      add(hole === -1 ? raw : raw.slice(0, hole), hole !== -1 || m[1].toLowerCase() === 'prefix');
    }
    for (const m of text.matchAll(TERNARY)) {
      add(m[2], false);
      add(m[4], false);
    }
  }
  return ids;
}

// Keys whose value names a testID: Maestro's own `id:`, and the env vars the
// shared subflows forward into one (`TAP`, `TARGET`, `INPUT`, `EXPECT`).
const REF = /^\s*-?\s*(id|TAP|TARGET|INPUT|EXPECT):\s*(.+?)\s*$/;

/** @returns {{ value: string, key: string, file: string }[]} */
export function flowRefs() {
  return ['flows', 'subflows'].flatMap((sub) =>
    walk(join(nativeDir, sub), (n) => n.endsWith('.yaml')).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .map((line) => line.match(REF))
        .filter(Boolean)
        .map((m) => ({ value: m[2].replace(/^(['"])(.*)\1$/, '$2'), key: m[1], file: relative(repoRoot, file) }))
        // A bare `${VAR}` is a subflow forwarding its caller's id; the caller is counted.
        .filter((r) => !/^\$\{[^}]+\}$/.test(r.value)),
    ),
  );
}

// Maestro matches `id:` as a full regex, and a flow's `${VAR}` stands for any value.
function refRegex(value) {
  try {
    return new RegExp(`^(?:${value.replace(/\$\{[^}]+\}/g, '.+')})$`);
  } catch {
    return null;
  }
}

const literalHead = (value) => value.split(/\$\{|[.*+?()[\]|\\^$]/)[0];

function touches(ref, key, prefix) {
  const re = refRegex(ref);
  if (prefix) {
    const head = key.slice(0, -1);
    return literalHead(ref).startsWith(head) || (re?.test(`${head}x1`) ?? false);
  }
  // A control's own id, or an id it derives from it (`startDate` → `startDate-date`).
  return (re?.test(key) ?? false) || ref.startsWith(`${key}-`);
}

// Ids the OS renders, not the app: iOS's keyboard accessory view.
const NATIVE_IDS = new Set(['inputView']);

export function coverage(ids = sourceTestIds(), refs = flowRefs()) {
  const covered = new Set();
  const uncovered = new Set();
  for (const [key, { prefix }] of ids) {
    (refs.some((r) => touches(r.value, key, prefix)) ? covered : uncovered).add(key);
  }
  // EXPECT doubles as a Firestore value in docField checks, so only keys that are
  // always ids must resolve to a control.
  const dangling = refs.filter(
    (r) => r.key !== 'EXPECT' && !NATIVE_IDS.has(r.value) && ![...ids].some(([key, { prefix }]) => touches(r.value, key, prefix)),
  );
  return { covered, uncovered, dangling };
}

// ── Form controls must carry a testID ──
//
// The ratchet only sees controls that have a testID, so a field added without
// one would be invisible to it. On form surfaces every input-like element must
// name one.

export const FORM_SURFACES = [
  /^app\/crear\//,
  /^app\/.*\/editar\.tsx$/,
  /^app\/.*\/(nuevo|nueva)\.tsx$/,
  /^app\/.*\/definir\.tsx$/,
  /^app\/\(onboarding\)\//,
  /^app\/persona\//,
  /^app\/ajustes\//,
  /^app\/descubrir\/organizar\//,
  /^components\/feature\/proposable\//,
  /^components\/feature\/history\//,
  /^components\/feature\/signup\//,
  /^components\/feature\/(PersonForm|CommunitySettingsEditor|FiestasEditor|BlockEditor|AttendeeSheet|GroupSignupSheet)\.tsx$/,
];

export const FORM_CONTROLS = [
  'Input',
  'TextInput',
  'MentionTextInput',
  'Toggle',
  'ToggleField',
  'DateField',
  'DateTimeField',
  'HistoricalDateField',
  'BirthDateField',
  'LocationField',
  'LocationPicker',
  'ImagePickerField',
  'MultiImagePickerRow',
  'EventCoverPicker',
  'CoverField',
  'CategoryField',
  'VillagePicker',
  'MyVillagePicker',
  'BarrioPicker',
  'PhoneField',
];

const CONTROL = new RegExp(`<(${FORM_CONTROLS.join('|')})\\b`, 'g');

// The opening tag runs to the first `>` outside braces, so `onChange={(v) => …}`
// does not end it early.
function openingTag(text, start) {
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === '{') depth++;
    else if (c === '}') depth--;
    else if (c === '>' && depth === 0) return text.slice(start, i + 1);
  }
  return text.slice(start);
}

/** @returns {{ file: string, line: number, control: string }[]} */
export function controlsWithoutTestId(files = sourceFiles()) {
  const misses = [];
  for (const file of files) {
    const rel = relative(mobileDir, file);
    if (!FORM_SURFACES.some((re) => re.test(rel))) continue;
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(CONTROL)) {
      // A spread (`{...phone.fieldProps}`) is trusted to carry it.
      if (/\b\w*[tT]est[Ii][Dd]\s*=|\{\s*\.\.\./.test(openingTag(text, m.index))) continue;
      misses.push({ file: `apps/mobile/${rel}`, line: text.slice(0, m.index).split('\n').length, control: m[1] });
    }
  }
  return misses;
}

export function readUncovered() {
  return JSON.parse(readFileSync(uncoveredPath, 'utf8'));
}

// Rewrites the gap list from the current coverage, keeping each surviving
// entry's reason and giving a new one `todo: <where it renders>`.
function writeUncovered() {
  const previous = readUncovered();
  const ids = sourceTestIds();
  const { uncovered } = coverage(ids);
  const todo = (k) => `todo: ${[...ids.get(k).files][0].replace('apps/mobile/', '')}`;
  const next = Object.fromEntries([...uncovered].sort().map((k) => [k, previous[k] ?? todo(k)]));
  writeFileSync(uncoveredPath, `${JSON.stringify(next, null, 2)}\n`);
  const removed = Object.keys(previous).filter((k) => !(k in next));
  process.stdout.write(`uncovered.json: ${Object.keys(next).length} entries (${removed.length} now covered or gone)\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href && process.argv.includes('--write')) {
  writeUncovered();
}

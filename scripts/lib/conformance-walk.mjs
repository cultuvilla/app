/**
 * The one walker behind the conformance gate (check-dev-conformance.mjs) and the
 * weekly schema audit (audit-firestore-schemas.mjs). Read-only.
 *
 * Each collection id is streamed once as a collection group and every doc is
 * matched to the target whose path template fits its path — ids collide
 * (`members` lives under municipalities and organizations), so the path, not
 * the id, picks the schema. One query per parent doc turned the gate into a
 * 30-minute timeout during the 0.21.0 release.
 *
 * Besides docs that fail to parse, the walk records UNMODELED fields: keys a
 * stored doc carries that the schema's parse drops. Zod objects strip unknown
 * keys, so such a field is invisible to every reader and silently lost on the
 * next converter write. The audit holds them at a baseline that may only shrink.
 */

/** `a/{x}/b` → a regex matching a document path directly under that collection. */
export function templateRegex(path) {
  const segments = path.split('/').map((s) => (s.startsWith('{') ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  return new RegExp(`^${segments.join('/')}/[^/]+$`);
}

/** `events/{eventId}/registrations` → `events/*\/registrations`. */
export const display = (path) => path.replace(/\{[^}]+\}/g, '*');

/** Format a caught converter error into `{ path, code, message }` issues, one per zod issue. */
export function issuesOf(err) {
  if (err && Array.isArray(err.issues)) {
    return err.issues.map((i) => ({ path: i.path.join('.') || '<root>', code: i.code ?? 'unknown', message: i.message }));
  }
  return [{ path: '<root>', code: 'error', message: String(err?.message ?? err) }];
}

/**
 * A map key that is data, not a field name — a doc id, a uid, a number, a date.
 * Collapsed to `*` so a field under a `z.record` keyed by ids yields one
 * signature instead of one per key.
 */
export function isDynamicKey(key) {
  return /^\d+$/.test(key) || /^\d{4}-\d{2}-\d{2}/.test(key) || /^(?=.*\d)[A-Za-z0-9_-]{12,}$/.test(key);
}

/** Normalize a dotted issue/field path: dynamic keys and array indices → `*` / `[]`. */
export function normalizePath(path) {
  return path
    .split('.')
    .map((s) => (/^\d+$/.test(s) ? '[]' : isDynamicKey(s) ? '*' : s))
    .join('.')
    .replace(/\.\[\]/g, '[]');
}

const isPlainObject = (v) =>
  v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);

/**
 * Field paths present in `raw` (the stored data) but absent from `parsed` (what
 * the schema kept). Recurses only where both sides are plain objects or both
 * are arrays, so Timestamps, GeoPoints and references are leaves.
 */
export function unmodeledPaths(raw, parsed, prefix = '') {
  const out = [];
  if (Array.isArray(raw) && Array.isArray(parsed)) {
    const n = Math.min(raw.length, parsed.length);
    for (let i = 0; i < n; i += 1) out.push(...unmodeledPaths(raw[i], parsed[i], `${prefix}[]`));
    return out;
  }
  if (!isPlainObject(raw) || !isPlainObject(parsed)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    const segment = isDynamicKey(key) ? '*' : key;
    const path = prefix ? `${prefix}.${segment}` : segment;
    if (!(key in parsed)) out.push(path);
    else out.push(...unmodeledPaths(value, parsed[key], path));
  }
  return [...new Set(out)];
}

/** True when every ancestor doc of `ref` exists. Read only for docs that fail to parse. */
async function ancestorsExist(ref) {
  for (let parent = ref.parent.parent; parent; parent = parent.parent.parent) {
    if (!(await parent.get()).exists) return false;
  }
  return true;
}

/**
 * Walk every target. Returns per-target totals and nonconforming docs, docs
 * under a deleted parent (orphans), paths no template matches, live root
 * collections the table does not declare, and the unmodeled-field tally keyed
 * by `template :: fieldPath`.
 */
export async function walkConformance(db, { targets, collectionPaths }) {
  const byId = new Map();
  for (const target of targets) {
    const id = target.path.slice(target.path.lastIndexOf('/') + 1);
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push({ path: target.path, converter: target.converter, regex: templateRegex(target.path), total: 0, bad: [] });
  }

  const unmatched = new Set();
  const orphans = [];
  const unmodeled = new Map();
  for (const [id, group] of byId) {
    for await (const doc of db.collectionGroup(id).stream()) {
      const target = group.find((t) => t.regex.test(doc.ref.path));
      if (!target) {
        unmatched.add(doc.ref.parent.path.replace(/\/[^/]+\//g, '/*/'));
        continue;
      }
      target.total += 1;
      let parsed;
      try {
        parsed = target.converter.fromFirestore(doc);
      } catch (err) {
        const finding = { id: doc.ref.path, issues: issuesOf(err) };
        if (await ancestorsExist(doc.ref)) target.bad.push(finding);
        else orphans.push(finding);
        continue;
      }
      for (const field of unmodeledPaths(doc.data(), parsed)) {
        const signature = `${display(target.path)} :: ${field}`;
        const entry = unmodeled.get(signature) ?? { count: 0, example: doc.ref.path };
        entry.count += 1;
        unmodeled.set(signature, entry);
      }
    }
  }

  // `_admin` is server-only operational state (backfill markers), not domain data.
  const declaredRoots = new Set([...collectionPaths.map((p) => p.split('/')[0]), '_admin']);
  const liveRoots = await db.listCollections();
  const undeclared = liveRoots.map((c) => c.id).filter((rootId) => !declaredRoots.has(rootId));

  const results = [...byId.values()].flat().map(({ path, total, bad }) => ({ path, total, bad }));
  return { targets: results, orphans, unmatched: [...unmatched].sort(), undeclared: undeclared.sort(), unmodeled };
}

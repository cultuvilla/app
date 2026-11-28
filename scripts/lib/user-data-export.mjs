/**
 * One user's data, read through the account-deletion registry (`UID_CASCADE`):
 * what deleting the account would remove, anonymise or leave to a trigger is
 * what the export hands over, so the export and the deletion cannot drift. The
 * entries the deletion keeps on purpose (`retain`) are listed with their reason
 * instead — they are mostly other people's records, and the reason is what the
 * reply to the requester quotes. Reads only.
 *
 * The plan is derived from each target's collection path and schema:
 *  - `id`   on a top-level collection → read `<collection>/<uid>`;
 *  - `path` (a collection under users/{userId}) → list it;
 *  - a field → query it, `array-contains` when the schema says it is a list,
 *    as a collection group when the collection is nested;
 *  - `fields: []` (a companion) → the documents beside or under the entry's
 *    other targets, or under COMPANION_ANCHORS when the entry has none.
 */

/** The registry entries an export reads documents for. `retain` is listed, not read. */
export const EXPORTED_ACTIONS = new Set(['delete', 'anonymise', 'trigger']);

/**
 * An effect whose subject is not Firestore: `deleteStoragePhotos` removes the
 * `users/{uid}/` prefix of the default bucket, which holds the account avatar
 * and every persona photo they uploaded.
 */
export const STORAGE_ENTRIES = { 'storage-photos': (uid) => `users/${uid}/` };

/**
 * A companion whose own entry names no collection it sits beside or under:
 * the contact a socio shared is `socioPrivate/{socioId}`, beside the socio row
 * whose `uid` is the user (`clearSocioContacts`).
 */
export const COMPANION_ANCHORS = { organizationSocioPrivate: { collection: 'organizationSocios', field: 'uid' } };

const WRAPPERS = new Set(['optional', 'nullable', 'default', 'readonly', 'catch', 'prefault', 'nonoptional']);

function unwrap(schema) {
  let def = schema?._zod?.def;
  for (let depth = 0; def && depth < 20; depth++) {
    if (WRAPPERS.has(def.type)) def = def.innerType?._zod?.def;
    else if (def.type === 'pipe') def = def.in?._zod?.def;
    else if (def.type === 'lazy' && def.getter) def = def.getter()?._zod?.def;
    else return def;
  }
  return def;
}

/** The Zod def at a dotted field path, or undefined when the walk leaves plain objects. */
function defAt(schema, field) {
  let def = unwrap(schema);
  for (const key of field.split('.')) {
    if (def?.type === 'intersection') def = unwrap(def.left)?.shape?.[key] ? unwrap(def.left) : unwrap(def.right);
    if (def?.type !== 'object' || !def.shape?.[key]) return undefined;
    def = unwrap(def.shape[key]);
  }
  return def;
}

/** `organizations/{organizationId}/tasks/{taskId}/chat` → `organizations/{}/tasks/{}/chat`. */
const shape = (template) => template.replace(/\{[^}]+\}/g, '{}');
const isNested = (template) => template.includes('{');
const lastSegment = (template) => template.split('/').at(-1);
const parentShape = (template) => shape(template).split('/').slice(0, -1).join('/');

/** A document path matches a collection template: same segments, any id where the template has `{…}`. */
export function matchesTemplate(docPath, template) {
  const doc = docPath.split('/');
  const tpl = template.split('/');
  if (doc.length !== tpl.length + 1) return false;
  return tpl.every((segment, i) => segment.startsWith('{') || segment === doc[i]);
}

/** How a target field is read, or why it cannot be: `{ read }` or `{ skip }`. */
function readFor(target, field, collections) {
  const { path: template, schema } = collections[target.collection];
  if (field === 'path') return { read: { kind: 'list', template } };
  if (field === 'id') {
    if (isNested(template)) return { skip: 'the document id is the uid under a parent no query can name; found by its other field' };
    return { read: { kind: 'doc', template } };
  }
  if (field.includes('[]')) return { skip: 'a field inside a list of objects: no query reaches it' };
  const def = schema ? defAt(schema, field) : undefined;
  if (def?.type === 'record') return { skip: 'a map keyed by uid: no query reaches a key' };
  const op = def?.type === 'array' ? 'array-contains' : '==';
  return { read: { kind: 'query', template, field, op } };
}

function companionFor(target, entry, collections) {
  const template = collections[target.collection].path;
  for (const other of entry.targets) {
    if (other === target || other.fields.length === 0) continue;
    const otherTemplate = collections[other.collection].path;
    if (shape(template) === `${shape(otherTemplate)}/{}/${lastSegment(template)}`) {
      return { kind: 'companion', template, anchor: other.collection, relation: 'child' };
    }
    if (isNested(template) && parentShape(template) === parentShape(otherTemplate)) {
      return { kind: 'companion', template, anchor: other.collection, relation: 'sibling' };
    }
  }
  const anchor = COMPANION_ANCHORS[target.collection];
  if (!anchor) return undefined;
  const anchorTemplate = collections[anchor.collection].path;
  return {
    kind: 'companion',
    template,
    anchor: anchor.collection,
    relation: parentShape(template) === parentShape(anchorTemplate) ? 'sibling' : 'child',
    anchorRead: { kind: 'query', template: anchorTemplate, field: anchor.field, op: '==' },
  };
}

/**
 * What an export reads, entry by entry. Throws when a target of an exported
 * entry has no way to be read: a registry change the export cannot follow
 * must fail loudly, not export less.
 */
export function planExport(registry, collections) {
  const entries = [];
  const retained = [];
  for (const entry of registry) {
    if (!EXPORTED_ACTIONS.has(entry.action)) {
      retained.push({ id: entry.id, reason: entry.reason, collections: [...new Set(entry.targets.map((t) => t.collection))] });
      continue;
    }
    if (entry.targets.length === 0) {
      if (!STORAGE_ENTRIES[entry.id]) throw new Error(`Entry ${entry.id} names no collection and no storage prefix: the export cannot read it.`);
      entries.push({ id: entry.id, action: entry.action, targets: [], storage: entry.id });
      continue;
    }
    const targets = entry.targets.map((target) => {
      if (!collections[target.collection]) throw new Error(`Entry ${entry.id}: unknown collection ${target.collection}.`);
      if (target.fields.length === 0) {
        const read = companionFor(target, entry, collections);
        if (!read) throw new Error(`Entry ${entry.id}: companion ${target.collection} has no anchor.`);
        return { collection: target.collection, reads: [{ ...read, field: null }], skipped: [] };
      }
      const reads = [];
      const skipped = [];
      for (const field of target.fields) {
        const found = readFor(target, field, collections);
        if (found.read) reads.push({ ...found.read, field: found.read.field ?? field });
        else skipped.push({ field, why: found.skip });
      }
      if (reads.length === 0) throw new Error(`Entry ${entry.id}: no field of ${target.collection} can be read (${target.fields.join(', ')}).`);
      return { collection: target.collection, reads, skipped };
    });
    entries.push({ id: entry.id, action: entry.action, targets });
  }
  return { entries, retained };
}

/** Firestore values in JSON form: timestamps as ISO strings, references as paths, geopoints as lat/lng. */
export function toPlainJson(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(toPlainJson);
  if (value instanceof Date) return value.toISOString();
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (typeof value.path === 'string' && typeof value.firestore === 'object') return value.path;
  if (typeof value.latitude === 'number' && typeof value.longitude === 'number' && Object.keys(value).length <= 2) {
    return { latitude: value.latitude, longitude: value.longitude };
  }
  if (typeof value.toBase64 === 'function') return value.toBase64();
  return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, toPlainJson(inner)]));
}

const fill = (template, uid) => template.replace('{userId}', uid);
const parentPath = (docPath) => docPath.split('/').slice(0, -2).join('/');
const docId = (docPath) => docPath.split('/').at(-1);

async function runRead(read, uid, reader) {
  if (read.kind === 'doc') {
    const doc = await reader.getDoc(`${read.template}/${uid}`);
    return doc ? [doc] : [];
  }
  if (read.kind === 'list') return reader.listCollection(fill(read.template, uid));
  const docs = await reader.query({
    collectionId: lastSegment(read.template),
    group: isNested(read.template),
    field: read.field,
    op: read.op,
    value: uid,
  });
  // A collection group spans every collection with that id (`chat` is four of them): keep this one's.
  return docs.filter((doc) => matchesTemplate(doc.path, read.template));
}

/**
 * Run the plan against a reader — `{ getDoc, listCollection, query, listFiles }`,
 * every one a read. Each document carries `matchedOn`, the fields that found
 * it, so the operator sees why it is in the file before sending it.
 */
export async function collectUserData(uid, plan, reader) {
  const entries = [];
  const storageObjects = [];
  for (const entry of plan.entries) {
    if (entry.storage) {
      storageObjects.push(...(await reader.listFiles(STORAGE_ENTRIES[entry.storage](uid))));
      continue;
    }
    const byPath = new Map();
    const add = (doc, collection, matched) => {
      const known = byPath.get(doc.path);
      if (known) known.matchedOn.add(matched);
      else byPath.set(doc.path, { path: doc.path, collection, matchedOn: new Set([matched]), data: doc.data });
    };
    const ordered = [...entry.targets].sort((a, b) => Number(a.reads[0].kind === 'companion') - Number(b.reads[0].kind === 'companion'));
    for (const target of ordered) {
      for (const read of target.reads) {
        if (read.kind !== 'companion') {
          for (const doc of await runRead(read, uid, reader)) add(doc, target.collection, `${target.collection}.${read.field}`);
          continue;
        }
        const anchors = read.anchorRead
          ? await runRead(read.anchorRead, uid, reader)
          : [...byPath.values()].filter((doc) => doc.collection === read.anchor);
        const name = lastSegment(read.template);
        for (const anchor of anchors) {
          const found = read.relation === 'child'
            ? await reader.listCollection(`${anchor.path}/${name}`)
            : [await reader.getDoc(`${parentPath(anchor.path)}/${name}/${docId(anchor.path)}`)].filter(Boolean);
          for (const doc of found) add(doc, target.collection, `${read.relation} of ${anchor.path}`);
        }
      }
    }
    const documents = [...byPath.values()]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((doc) => ({ path: doc.path, matchedOn: [...doc.matchedOn].sort(), data: toPlainJson(doc.data) }));
    entries.push({ id: entry.id, action: entry.action, documents });
  }
  return { uid, entries, storageObjects: [...new Set(storageObjects)].sort(), retained: plan.retained };
}

/** Entry id → document count, for the terminal. */
export const summarize = (bundle) => ({
  ...Object.fromEntries(bundle.entries.map((entry) => [`${entry.id} (${entry.action})`, entry.documents.length])),
  storageObjects: bundle.storageObjects.length,
  retainedEntries: bundle.retained.length,
});

const WRITE_METHODS = new Set(['batch', 'bulkWriter', 'runTransaction', 'recursiveDelete']);

/** A Firestore handle that throws on every way the Admin SDK writes in bulk. Documents are only ever `.get()` here. */
export function readOnlyFirestore(db) {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (WRITE_METHODS.has(prop)) {
        return () => {
          throw new Error(`Refused: ${String(prop)}() — the data export reads only.`);
        };
      }
      const value = Reflect.get(target, prop, receiver);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
}

/** The reader `collectUserData` takes, over the Admin SDK. Converters are dropped: a stale doc must export, not throw. */
export function adminReader(db, bucket) {
  const ro = readOnlyFirestore(db);
  const asDoc = (snap) => ({ path: snap.ref.path, data: snap.data() });
  return {
    async getDoc(path) {
      const snap = await ro.doc(path).withConverter(null).get();
      return snap.exists ? asDoc(snap) : null;
    },
    async listCollection(path) {
      return (await ro.collection(path).withConverter(null).get()).docs.map(asDoc);
    },
    async query({ collectionId, group, field, op, value }) {
      const source = group ? ro.collectionGroup(collectionId) : ro.collection(collectionId);
      return (await source.withConverter(null).where(field, op, value).get()).docs.map(asDoc);
    },
    async listFiles(prefix) {
      const [files] = await bucket.getFiles({ prefix });
      return files.map((file) => `gs://${bucket.name}/${file.name}`);
    },
  };
}

/** A Firebase Auth uid as an operator types it: it ends up in a file name, so nothing that could leave the directory. */
export function assertUid(uid) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid ?? '')) throw new Error(`Not a uid: ${JSON.stringify(uid)}`);
  return uid;
}

/** One file per run: `export-user-<env>-<uid>-<timestamp>.json`. */
export const exportFileName = (env, uid, now) => `export-user-${env}-${uid}-${now.toISOString().replace(/[:.]/g, '-')}.json`;

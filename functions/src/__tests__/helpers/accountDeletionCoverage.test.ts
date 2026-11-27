/**
 * Account deletion accounts for every place a uid is stored. Pure — no emulator.
 *
 * A collection added to COLLECTIONS, or a uid-looking field added to a covered
 * collection's schema, fails here until `UID_CASCADE` deletes it, anonymises
 * it, leaves it to a trigger or keeps it with a reason — or `UID_FREE` says why
 * it holds no uid. See docs/legal/politica-de-privacidad.md §7.
 */
import { describe, expect, it } from 'vitest';
import { COLLECTIONS, type CollectionKey } from '@cultuvilla/shared/firebase/refs/admin';
import { UID_CASCADE, UID_FREE } from '../../account/cascade/registry';

/** A field whose name says it holds a uid: `userId`, `ownerUid`, `assigneeUids`, `createdBy`, `organizerId`, … */
const UID_FIELD = /(^|\.)(uid|uids|userId|userIds|organizerId|[a-zA-Z]*(Uid|Uids|UserId|UserIds|OwnerId|By))$/;
const TOKENS = new Set(['id', 'path']);

interface ZodDef {
  type: string;
  shape?: Record<string, unknown>;
  innerType?: unknown;
  in?: unknown;
  element?: unknown;
  valueType?: unknown;
  options?: unknown[];
  left?: unknown;
  right?: unknown;
  getter?: () => unknown;
}

const WRAPPERS = new Set(['optional', 'nullable', 'default', 'readonly', 'catch', 'prefault', 'nonoptional']);

function defOf(schema: unknown): ZodDef | undefined {
  if (typeof schema !== 'object' || schema === null) return undefined;
  const zod = (schema as { _zod?: { def?: ZodDef } })._zod;
  return zod?.def;
}

/** Every leaf field path of a Zod (v4) schema: `heldBy.uid`, `topOrganizers.[].userId`. */
function leafFields(schema: unknown, prefix = '', depth = 0): string[] {
  if (depth > 20) return [];
  const def = defOf(schema);
  if (!def) return [];
  if (WRAPPERS.has(def.type)) return leafFields(def.innerType, prefix, depth + 1);
  if (def.type === 'pipe') return leafFields(def.in, prefix, depth + 1);
  if (def.type === 'lazy' && def.getter) return leafFields(def.getter(), prefix, depth + 1);
  if (def.type === 'array') return leafFields(def.element, `${prefix}[].`, depth + 1);
  if (def.type === 'record') return leafFields(def.valueType, `${prefix}{}.`, depth + 1);
  if (def.type === 'union' && def.options) return [...new Set(def.options.flatMap((option) => leafFields(option, prefix, depth + 1)))];
  if (def.type === 'intersection') return [...leafFields(def.left, prefix, depth + 1), ...leafFields(def.right, prefix, depth + 1)];
  if (def.type === 'object' && def.shape) {
    return Object.entries(def.shape).flatMap(([key, value]) => {
      const nested = leafFields(value, `${prefix}${key}.`, depth + 1);
      return nested.length > 0 ? nested : [`${prefix}${key}`];
    });
  }
  return [];
}

/** Leaf paths and their parents, so a target may name a map (`reactions`) as well as a leaf. */
function knownFields(schema: unknown): Set<string> {
  const known = new Set<string>();
  for (const leaf of leafFields(schema)) {
    const parts = leaf.split('.');
    for (let i = 1; i <= parts.length; i++) known.add(parts.slice(0, i).join('.'));
  }
  return known;
}

const keys = Object.keys(COLLECTIONS) as CollectionKey[];
const targets = UID_CASCADE.flatMap((entry) => entry.targets.map((target) => ({ id: entry.id, ...target })));
const declaredFields = (collection: CollectionKey) =>
  new Set(targets.filter((target) => target.collection === collection).flatMap((target) => target.fields));
const uidFieldsOf = (collection: CollectionKey) => leafFields(COLLECTIONS[collection].schema).filter((field) => UID_FIELD.test(field));

describe('the schema walk the coverage rests on', () => {
  it('finds uid fields at every depth', () => {
    expect(uidFieldsOf('cosas')).toEqual(expect.arrayContaining(['ownerUid', 'createdBy', 'heldBy.uid']));
    expect(uidFieldsOf('municipalities')).toContain('community.organizerId');
    expect(uidFieldsOf('villageWrapped')).toContain('topOrganizers.[].userId');
    expect(uidFieldsOf('organizationTasks')).toContain('assigneeUids');
  });

  it('finds none where there are none', () => {
    expect(uidFieldsOf('occupations')).toEqual([]);
    expect(uidFieldsOf('config')).toEqual([]);
  });
});

describe('UID_CASCADE coverage', () => {
  it('has unique entry ids', () => {
    const ids = UID_CASCADE.map((entry) => entry.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('accounts for every collection: an entry, or a uid-free reason', () => {
    const covered = new Set(targets.map((target) => target.collection));
    expect(keys.filter((key) => !covered.has(key) && !(key in UID_FREE))).toEqual([]);
  });

  it('lists as uid-free only collections no entry claims', () => {
    const covered = new Set(targets.map((target) => target.collection));
    expect(Object.keys(UID_FREE).filter((key) => covered.has(key as CollectionKey) || !keys.includes(key as CollectionKey))).toEqual([]);
  });

  it('never calls uid-free a collection with a uid field or under users/{userId}', () => {
    const wrong = (Object.keys(UID_FREE) as CollectionKey[]).filter(
      (key) => uidFieldsOf(key).length > 0 || COLLECTIONS[key].path.includes('{userId}'),
    );
    expect(wrong).toEqual([]);
  });

  it('names every uid field of a covered collection in some entry', () => {
    const missing = keys.flatMap((key) => {
      const declared = declaredFields(key);
      return uidFieldsOf(key)
        .filter((field) => !declared.has(field))
        .map((field) => `${key}.${field}`);
    });
    expect(missing).toEqual([]);
  });

  it('names only fields its schema has', () => {
    const unknown = targets.flatMap((target) => {
      const { schema, path } = COLLECTIONS[target.collection];
      const known = knownFields(schema);
      return target.fields
        .filter((field) => {
          if (field === 'path') return !path.includes('{userId}');
          if (TOKENS.has(field)) return false;
          return schema !== null && !known.has(field);
        })
        .map((field) => `${target.id}: ${target.collection}.${field}`);
    });
    expect(unknown).toEqual([]);
  });

  it('runs every collection under users/{userId} through an effect', () => {
    const effectCollections = new Set(
      UID_CASCADE.filter((entry) => entry.action === 'delete' || entry.action === 'anonymise').flatMap((entry) =>
        entry.targets.map((target) => target.collection),
      ),
    );
    expect(keys.filter((key) => COLLECTIONS[key].path.includes('{userId}') && !effectCollections.has(key))).toEqual([]);
  });

  it('gives every retained or trigger-owned entry a reason', () => {
    const unexplained = UID_CASCADE.filter((entry) => (entry.action === 'retain' || entry.action === 'trigger') && entry.reason.trim() === '');
    expect(unexplained.map((entry) => entry.id)).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { Firestore as AdminFirestore } from 'firebase-admin/firestore';
import * as clientRefs from '../../src/firebase/refs/client';
import * as adminRefs from '../../src/firebase/refs/admin';
import { COLLECTIONS, collectionSegments } from '../../src/firebase/refs/collections';
import { clientConverter } from '../../src/firebase/converters/sdkAdapters.client';
import { adminConverter } from '../../src/firebase/converters/sdkAdapters.admin';
import { eventConverterClient } from '../../src/firebase/converters/eventConverter.client';
import { eventConverterAdmin } from '../../src/firebase/converters/eventConverter.admin';

// The two refs files are bindings of one table (refs/collections.ts). These
// tests build every factory on both sides against unconnected instances and
// hold them to the table: same paths, paths the table declares, and exactly
// one converter object per schema per SDK (the JS SDK's `refEqual` compares
// converters by identity).

const clientDb = getFirestore(initializeApp({ projectId: 'demo-refs-table' }, 'refs-table'));
const adminDb = new AdminFirestore({ projectId: 'demo-refs-table' });

type Factory = (db: unknown, ...ids: string[]) => unknown;
interface Built { name: string; path?: string; converter: unknown }

const IDS = ['id1', 'id2', 'id3', 'id4'];

function factories(mod: Record<string, unknown>): [string, Factory][] {
  return Object.entries(mod).filter((e): e is [string, Factory] => typeof e[1] === 'function');
}

function build(mod: Record<string, unknown>, db: unknown, converterOf: (ref: object) => unknown): Built[] {
  return factories(mod).map(([name, fn]) => {
    // A union-typed collection-name argument takes its first valid value.
    const args = IDS.slice(0, fn.length - 1);
    if (name in UNION_ARGS) args.splice(UNION_ARGS[name].at, 1, UNION_ARGS[name].value);
    const ref = fn(db, ...args) as { path?: string } & object;
    return { name, path: ref.path, converter: converterOf(ref) };
  });
}

const UNION_ARGS: Record<string, { at: number; value: string }> = {
  organizationCuotaWriteDoc: { at: 1, value: 'cuotaPayments' },
  cosatecaWriteDoc: { at: 0, value: 'cosaRequests' },
  organizationTaskWriteDoc: { at: 1, value: 'taskTemplates' },
  organizationMessageWriteDoc: { at: 2, value: 'votes' },
  organizationRecordsWriteDoc: { at: 1, value: 'ledgerEntries' },
};

const clientBuilt = build(clientRefs, clientDb, (ref) => (ref as { converter?: unknown }).converter ?? null);
const adminBuilt = build(adminRefs, adminDb, (ref) => (ref as { _converter?: unknown })._converter ?? null);

/** The table entry whose collection holds a ref at `path` (a collection or a doc path). */
function entryFor(path: string) {
  return Object.values(COLLECTIONS).find((def) => {
    const pattern = def.path.split('/').map((s) => (s.startsWith('{') ? '[^/]+' : s)).join('/');
    return new RegExp(`^${pattern}(/[^/]+)?$`).test(path);
  });
}

describe('refs table', () => {
  it('builds every factory on both sides', () => {
    expect(clientBuilt.length).toBeGreaterThan(80);
    expect(adminBuilt.length).toBeGreaterThan(80);
  });

  it('gives a factory exported by both sides the same arity and the same path', () => {
    const admin = new Map(adminBuilt.map((b) => [b.name, b]));
    const shared = clientBuilt.filter((b) => admin.has(b.name) && b.path !== undefined);
    expect(shared.length).toBeGreaterThan(80);
    const clientFactories = new Map(factories(clientRefs));
    const adminFactories = new Map(factories(adminRefs));
    for (const c of shared) {
      expect([c.name, clientFactories.get(c.name)?.length]).toEqual([
        c.name,
        adminFactories.get(c.name)?.length,
      ]);
      expect([c.name, c.path]).toEqual([c.name, admin.get(c.name)?.path]);
    }
  });

  it('reaches only paths the table declares', () => {
    for (const b of [...clientBuilt, ...adminBuilt]) {
      if (b.path === undefined) continue;
      expect([b.name, entryFor(b.path)?.path ?? 'undeclared']).not.toEqual([b.name, 'undeclared']);
    }
  });

  it('builds no client ref to a server-only collection', () => {
    for (const b of clientBuilt) {
      if (b.path === undefined) continue;
      expect([b.name, entryFor(b.path)?.serverOnly]).toEqual([b.name, false]);
    }
  });

  it('attaches the one converter of the entry schema, or none for a raw ref', () => {
    const sides = [
      { built: clientBuilt, converterFor: clientConverter },
      { built: adminBuilt, converterFor: adminConverter },
    ];
    for (const { built, converterFor } of sides) {
      for (const b of built) {
        const schema = b.path === undefined ? null : entryFor(b.path)?.schema;
        // A raw ref: the client carries no converter, the Admin SDK its default one.
        if (!schema || b.converter === null || b.name.includes('Write')) continue;
        expect([b.name, b.converter === converterFor(schema)]).toEqual([b.name, true]);
      }
    }
  });

  it('keeps the converter files on the same object the refs carry', () => {
    expect(clientRefs.eventDoc(clientDb, 'e').converter).toBe(eventConverterClient);
    const adminRef = adminRefs.eventDoc(adminDb, 'e');
    expect('_converter' in adminRef && adminRef._converter).toBe(eventConverterAdmin);
  });

  it('fills a path template in order and refuses the wrong arity', () => {
    expect(collectionSegments('a/{x}/b/{y}/c', ['1', '2'])).toEqual(['a', '1', 'b', '2', 'c']);
    expect(() => collectionSegments('a/{x}/b', [])).toThrow(/takes 1 parent id/);
    expect(() => collectionSegments('a', ['1'])).toThrow(/takes 0 parent id/);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  municipalitySearchKey,
  municipalitySearchPrefixes,
} from '../../src/models/municipality/MunicipalityDataModel';
import { searchKey, searchPrefixes } from '../../../../scripts/lib/municipality-search.mjs';

// The app QUERIES `searchPrefixes` with `municipalitySearchPrefixes`' notion of
// a key; the seed and backfill scripts WRITE it with the .mjs copy in
// scripts/lib/municipality-search.mjs. If the two ever drift, the failure is
// silent and total for the affected municipalities: the doc exists, the query
// is valid, and the village is simply unfindable. That is exactly the class of
// bug this whole change was fixing, so it gets a guard.

const repoRoot = resolve(__dirname, '../../../..');
const datasetPath = resolve(repoRoot, 'scripts/data/municipalities-es.json');

interface Entry {
  name: string;
  codigoINE: string;
  nameAliases?: string[];
  localityNames?: string[];
}

const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8')) as Entry[];

function byIne(ine: string): Entry {
  const entry = dataset.find((e) => e.codigoINE === ine);
  if (!entry) throw new Error(`INE ${ine} missing from municipalities-es.json`);
  return entry;
}

const jsKey = searchKey as (name: string) => string;
const jsPrefixes = searchPrefixes as (
  name: string,
  aliases?: string[],
  localities?: string[],
) => string[];

describe('municipality search key parity (TS model vs. scripts/lib .mjs)', () => {
  it('agrees on the search key for every municipality in the dataset', () => {
    const drift = dataset.filter((e) => municipalitySearchKey(e.name) !== jsKey(e.name));
    expect(drift.map((e) => `${e.codigoINE} ${e.name}`)).toEqual([]);
  });

  it('agrees on the prefix set for every municipality in the dataset', () => {
    const drift = dataset.filter((e) => {
      const aliases = e.nameAliases ?? [];
      const localities = e.localityNames ?? [];
      const ts = municipalitySearchPrefixes(e.name, aliases, localities);
      const js = jsPrefixes(e.name, aliases, localities);
      return ts.length !== js.length || ts.some((v, i) => v !== js[i]);
    });
    expect(drift.map((e) => `${e.codigoINE} ${e.name}`)).toEqual([]);
  });

  it('agrees on the awkward shapes — punctuation, single stopword, empty', () => {
    for (const name of ["Castillo de Aro, Playa de Aro y S'Agaró", 'Es', 'Ávila', '', '  ']) {
      expect(municipalitySearchPrefixes(name)).toEqual(jsPrefixes(name));
    }
  });
});

describe('the dataset is actually searchable', () => {
  // Regression guard for the report that started this: a resident of Villarino
  // de Manzanas could not find their pueblo. Villarino de Manzanas is an
  // *entidad singular* of Figueruela de Arriba, so the municipality is what has
  // to be findable — and it has to be findable by the word a resident types.
  it('finds a municipality by a non-leading word of its name', () => {
    const figueruela = byIne('49069');
    expect(figueruela.name).toBe('Figueruela de Arriba');
    expect(municipalitySearchPrefixes(figueruela.name)).toContain('arriba');

    const manzanas = byIne('24218');
    expect(manzanas.name).toBe('Villanueva de las Manzanas');
    expect(municipalitySearchPrefixes(manzanas.name)).toContain('manzanas');
  });

  it('finds bilingual municipalities by their co-official name', () => {
    const cases: [string, string][] = [
      ['20069', 'donostia'],
      ['15030', 'a coruna'],
      ['25120', 'lleida'],
      ['03014', 'alacant'],
    ];
    for (const [ine, typed] of cases) {
      const entry = byIne(ine);
      const prefixes = municipalitySearchPrefixes(entry.name, entry.nameAliases ?? []);
      expect(prefixes, `${entry.name} not findable as "${typed}"`).toContain(typed);
    }
  });

  it('gives every entry a nameAliases array, so the seed never writes undefined', () => {
    expect(dataset.every((e) => Array.isArray(e.nameAliases))).toBe(true);
  });

  it('gives every entry a localityNames array', () => {
    expect(dataset.every((e) => Array.isArray(e.localityNames))).toBe(true);
  });

  // The whole point of the locality index: this is the search that started the
  // bug report, and it has to resolve to the municipio that contains it.
  it('finds Figueruela de Arriba by searching for Villarino de Manzanas', () => {
    const figueruela = byIne('49069');
    expect(figueruela.localityNames).toContain('Villarino de Manzanas');
    const prefixes = municipalitySearchPrefixes(
      figueruela.name,
      figueruela.nameAliases ?? [],
      figueruela.localityNames ?? [],
    );
    expect(prefixes).toContain('villarino de manzanas');
    expect(prefixes).toContain('manzanas');
  });

  it('never lists the municipio itself as one of its own localities', () => {
    const selfListed = dataset.filter((e) => (e.localityNames ?? []).includes(e.name));
    expect(selfListed.map((e) => `${e.codigoINE} ${e.name}`)).toEqual([]);
  });

  it('keeps the prefix index small enough to stay a cheap array index', () => {
    const sizes = dataset.map(
      (e) =>
        municipalitySearchPrefixes(e.name, e.nameAliases ?? [], e.localityNames ?? []).length,
    );
    const max = Math.max(...sizes);
    const mean = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    // Real data today: max 587 entries / 4.2KB on Llanera (70 localities),
    // mean 34 / 255 bytes. Firestore allows 40,000 index entries and ~1MB per
    // document, so there is a lot of headroom — but a runaway locality list
    // would show up here first.
    expect(max).toBeLessThan(2000);
    expect(mean).toBeLessThan(100);
  });
});

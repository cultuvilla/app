import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyRegionalKind, dedupe, group, kindForPlace } from '../lib/settlements.mjs';

const FIGUERUELA = { ine: '49069', name: 'Figueruela de Arriba' };
const PEDANIAS = [
  'Figueruela de Abajo',
  'Flechas',
  'Gallegos del Campo',
  'Moldones',
  'Riomanzanas',
  'Villarino de Manzanas',
];

/**
 * Figueruela de Arriba's real shape in OSM: 260 `place` nodes, of which only
 * the seat and its six pedanías are settlements. The rest are uninhabited
 * toponyms (place=locality) and a few isolated dwellings.
 */
function figueruelaOverpass() {
  let id = 1000;
  const node = (place, name) => ({ type: 'node', id: id++, lat: 41.87, lon: -6.44, tags: { place, name } });
  const seat = node('village', FIGUERUELA.name);
  const elements = [
    { type: 'relation', id: 1, tags: { admin_level: '8', name: FIGUERUELA.name, 'ine:municipio': FIGUERUELA.ine } },
    // The admin_centre marker: `out ids` emits it with no tags.
    { type: 'node', id: seat.id },
    seat,
    ...PEDANIAS.map((name, i) => node(i % 2 ? 'hamlet' : 'village', name)),
  ];
  for (let i = 0; i < 248; i++) elements.push(node('locality', `Paraje ${i}`));
  for (let i = 0; i < 5; i++) elements.push(node('isolated_dwelling', `Casa ${i}`));
  return elements;
}

const run = (elements) =>
  group(elements, new Map([[FIGUERUELA.ine, FIGUERUELA.name]]), new Map())
    .map(applyRegionalKind)
    .map(dedupe);

describe('fetch-settlements: what counts as a settlement', () => {
  it('keeps Figueruela de Arriba to its 7 settlements, not its 260 place nodes', () => {
    const elements = figueruelaOverpass();
    assert.equal(elements.filter((e) => e.tags?.place).length, 260);

    const [entry] = run(elements);
    assert.equal(entry.codigoINE, FIGUERUELA.ine);
    assert.equal(entry.settlements.length, 7);
    assert.deepEqual(
      entry.settlements.map((s) => s.name),
      [FIGUERUELA.name, ...PEDANIAS],
    );
  });

  it('flags only the seat, and puts it first', () => {
    const [entry] = run(figueruelaOverpass());
    assert.deepEqual(
      entry.settlements.filter((s) => s.isSeat).map((s) => s.name),
      [FIGUERUELA.name],
    );
    assert.equal(entry.settlements[0].isSeat, true);
  });

  it('maps uninhabited and diseminado places to no kind at all', () => {
    assert.equal(kindForPlace('locality'), null);
    assert.equal(kindForPlace('isolated_dwelling'), null);
    assert.equal(kindForPlace('hamlet'), 'pedania');
    assert.equal(kindForPlace('neighbourhood'), 'barrio');
  });

  it('ships a dataset where Figueruela de Arriba has 6–7 settlements', () => {
    // Guards the committed output, not just the function: a re-fetch that let
    // place=locality through would turn this into hundreds of rows.
    const data = JSON.parse(
      readFileSync(new URL('../data/settlements-es.json', import.meta.url), 'utf8'),
    );
    const entry = data.find((e) => e.codigoINE === FIGUERUELA.ine);
    assert.ok(entry, 'Figueruela de Arriba is in the dataset');
    assert.ok(
      entry.settlements.length >= 6 && entry.settlements.length <= 7,
      `expected 6–7 settlements, got ${entry.settlements.length}`,
    );
    assert.ok(entry.settlements.some((s) => s.name === 'Villarino de Manzanas'));
  });
});

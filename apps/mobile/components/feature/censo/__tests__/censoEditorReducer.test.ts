import { describe, it, expect } from '@jest/globals';
import { censoEditorReducer, uniqueKey, fieldErrors } from '../censoEditorReducer';
import type { ProfileFormField } from '@cultuvilla/shared/models/municipality/CensoTypes';

const cf = (over: Partial<ProfileFormField> = {}): ProfileFormField =>
  ({ source: 'custom', key: 'k', label: 'L', type: 'text', required: false, ...over } as ProfileFormField);

describe('censoEditorReducer', () => {
  it('addCustom appends a blank field of the given type', () => {
    const r = censoEditorReducer([], { kind: 'addCustom', type: 'select' });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ source: 'custom', type: 'select', label: '' });
  });

  // Regression: adding a "village element" question (e.g. Peñas) is the
  // orchestrator's addCustom('select') + setSource(source) sequence followed
  // by the user typing a label. The result must be a valid entity-backed
  // field — optionsSource set, no static options — so it does not trip the
  // "requiere opciones" rule on save.
  it('add-entity flow yields a valid optionsSource field with no static options', () => {
    let state = censoEditorReducer([], { kind: 'addCustom', type: 'select' });
    state = censoEditorReducer(state, { kind: 'setSource', index: 0, source: 'organizations' });
    state = censoEditorReducer(state, { kind: 'setLabel', index: 0, label: '¿Cuál es tu peña?' });
    expect(state[0]).toMatchObject({
      source: 'custom',
      type: 'select',
      optionsSource: 'organizations',
      key: 'cual_es_tu_pena',
    });
    expect((state[0] as { options?: unknown }).options).toBeUndefined();
    // A labelled entity field is error-free (no emptyLabel, no needsOptions).
    expect(fieldErrors(state)[0]).toBeUndefined();
  });
  it('setLabel regenerates the key from the label', () => {
    const r = censoEditorReducer([cf({ label: '', key: '' })], { kind: 'setLabel', index: 0, label: 'Año de llegada' });
    expect(r[0]!.label).toBe('Año de llegada');
    expect(r[0]!.key).toBe('ano_de_llegada');
  });
  it('changeType to select clears optionsSource and keeps options empty', () => {
    const r = censoEditorReducer([cf({ type: 'text' })], { kind: 'changeType', index: 0, type: 'select' });
    expect(r[0]).toMatchObject({ type: 'select' });
  });
  it('setSource clears static options', () => {
    const r = censoEditorReducer([cf({ type: 'select', options: ['a'] })], { kind: 'setSource', index: 0, source: 'barrios' });
    expect((r[0] as { optionsSource?: unknown }).optionsSource).toBe('barrios');
    expect((r[0] as { options?: unknown }).options).toBeUndefined();
  });
  it('move reorders', () => {
    const a = cf({ key: 'a', label: 'A' }); const b = cf({ key: 'b', label: 'B' });
    const r = censoEditorReducer([a, b], { kind: 'move', index: 0, dir: 1 });
    expect(r.map((f) => f.key)).toEqual(['b', 'a']);
  });
  it('reset replaces all fields', () => {
    const r = censoEditorReducer([cf()], { kind: 'reset', fields: [cf({ key: 'x', label: 'X' })] });
    expect(r.map((f) => f.key)).toEqual(['x']);
  });

  it('changeType from non-choice to select yields empty options', () => {
    const r = censoEditorReducer([cf({ type: 'text' })], { kind: 'changeType', index: 0, type: 'select' });
    expect(r[0]).toMatchObject({ type: 'select', options: [] });
    expect((r[0] as { optionsSource?: unknown }).optionsSource).toBeUndefined();
  });

  it('changeType between choice types preserves existing options', () => {
    const r = censoEditorReducer([cf({ type: 'select', options: ['a', 'b'] })], { kind: 'changeType', index: 0, type: 'multiselect' });
    expect(r[0]).toMatchObject({ type: 'multiselect', options: ['a', 'b'] });
  });

  it('changeType to a non-choice type drops options', () => {
    const r = censoEditorReducer([cf({ type: 'select', options: ['a'] })], { kind: 'changeType', index: 0, type: 'number' });
    expect((r[0] as { options?: unknown }).options).toBeUndefined();
  });

  it('changeType between choice types preserves an entity optionsSource and drops static options', () => {
    const r = censoEditorReducer(
      [cf({ type: 'select', options: undefined, optionsSource: 'barrios' })],
      { kind: 'changeType', index: 0, type: 'multiselect' },
    );
    expect(r[0]).toMatchObject({ type: 'multiselect', optionsSource: 'barrios' });
    expect((r[0] as { options?: unknown }).options).toBeUndefined();
  });

  it('changeType from a choice to a non-choice clears optionsSource', () => {
    const r = censoEditorReducer(
      [cf({ type: 'select', options: undefined, optionsSource: 'places' })],
      { kind: 'changeType', index: 0, type: 'text' },
    );
    expect((r[0] as { optionsSource?: unknown }).optionsSource).toBeUndefined();
  });

  it('addCustom of a non-choice type has no options property', () => {
    const r = censoEditorReducer([], { kind: 'addCustom', type: 'text' });
    expect('options' in r[0]!).toBe(false);
  });

  it('addPredefined appends the predefined field', () => {
    const r = censoEditorReducer([], { kind: 'addPredefined', key: 'barrio' });
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ source: 'predefined', key: 'barrio' });
  });

  it('addPredefined is a no-op when the key already exists', () => {
    const r = censoEditorReducer([{ source: 'predefined', key: 'barrio', required: false }], { kind: 'addPredefined', key: 'barrio' });
    expect(r).toHaveLength(1);
  });
});

describe('uniqueKey', () => {
  it('suffixes collisions', () => {
    expect(uniqueKey('barrio', ['barrio'])).toBe('barrio_2');
  });
});

describe('fieldErrors', () => {
  it('flags an empty label and a choice with no options', () => {
    const e = fieldErrors([cf({ label: '' }), cf({ type: 'select', label: 'X', options: [] })]);
    expect(e[0]).toBeDefined();
    expect(e[1]).toBeDefined();
  });
});

import { describe, it, expect } from 'vitest';
import {
  MAX_SIGNUP_FIELDS,
  SignupFieldSpecSchema,
  SignupFieldsSchema,
  isAdditiveSignupFieldChange,
  isUsableSignupField,
  makeSignupFieldId,
  validateSignupAnswers,
  type SignupFieldSpec,
} from '../../src/models/event/SignupFieldModel';
import { buildEventData } from '../../src/models/event/EventDataModel';
import { buildLocationData } from '../../src/models/core/LocationDataModel';

function field(over: Partial<SignupFieldSpec> = {}): SignupFieldSpec {
  return { id: 'f1', label: 'Talla', type: 'text', required: false, options: [], ...over };
}

describe('SignupFieldSpecSchema', () => {
  it('parses a spec and defaults options to an empty list', () => {
    const parsed = SignupFieldSpecSchema.parse({
      id: 'f1',
      label: 'DNI',
      type: 'text',
      required: true,
    });
    expect(parsed.options).toEqual([]);
  });

  it('rejects an unknown field type and an empty label', () => {
    expect(() => SignupFieldSpecSchema.parse({ ...field(), type: 'file' })).toThrow();
    expect(() => SignupFieldSpecSchema.parse({ ...field(), label: '' })).toThrow();
  });

  it('caps the number of fields on an event', () => {
    const many = Array.from({ length: MAX_SIGNUP_FIELDS + 1 }, (_, i) => field({ id: `f${String(i)}` }));
    expect(() => SignupFieldsSchema.parse(many)).toThrow();
    expect(SignupFieldsSchema.parse(many.slice(0, MAX_SIGNUP_FIELDS))).toHaveLength(MAX_SIGNUP_FIELDS);
  });

  it('generates distinct field ids', () => {
    const ids = new Set(Array.from({ length: 50 }, () => makeSignupFieldId()));
    expect(ids.size).toBe(50);
  });

  it('treats a select with no options as unusable', () => {
    expect(isUsableSignupField(field({ type: 'select', options: [] }))).toBe(false);
    expect(isUsableSignupField(field({ type: 'select', options: ['M'] }))).toBe(true);
    expect(isUsableSignupField(field({ type: 'text' }))).toBe(true);
  });
});

describe('buildEventData', () => {
  it('defaults signupFields to an empty list', () => {
    const event = buildEventData({
      title: 'Carrera',
      description: '',
      startDate: new Date('2026-09-01T10:00:00Z'),
      location: buildLocationData({ coordinates: { lat: 40, lng: -3 }, displayName: 'Plaza' }),
      organizerUserIds: ['u1'],
      organizerOrgIds: [],
      createdBy: 'u1',
      municipalityId: 'm1',
      villageName: 'Villa',
      villageSlug: 'villa',
      villageCoordinates: null,
    });
    expect(event.signupFields).toEqual([]);
  });
});

describe('validateSignupAnswers', () => {
  it('accepts an empty answer set when nothing is required', () => {
    expect(validateSignupAnswers([field()], {})).toEqual({ ok: true, value: {} });
    expect(validateSignupAnswers([], undefined)).toEqual({ ok: true, value: {} });
  });

  it('rejects a missing required answer', () => {
    const res = validateSignupAnswers([field({ required: true })], {});
    expect(res).toEqual({ ok: false, fieldId: 'f1', reason: 'required' });
  });

  it('treats a blank string as missing', () => {
    const res = validateSignupAnswers([field({ required: true })], { f1: '   ' });
    expect(res).toEqual({ ok: false, fieldId: 'f1', reason: 'required' });
  });

  it('trims text answers and rejects over-long ones', () => {
    expect(validateSignupAnswers([field()], { f1: '  M  ' })).toEqual({
      ok: true,
      value: { f1: 'M' },
    });
    const long = validateSignupAnswers([field()], { f1: 'x'.repeat(201) });
    expect(long).toEqual({ ok: false, fieldId: 'f1', reason: 'too-long' });
  });

  it('coerces a numeric string to a number and rejects non-numbers', () => {
    expect(validateSignupAnswers([field({ type: 'number' })], { f1: '42' })).toEqual({
      ok: true,
      value: { f1: 42 },
    });
    expect(validateSignupAnswers([field({ type: 'number' })], { f1: 'abc' })).toEqual({
      ok: false,
      fieldId: 'f1',
      reason: 'not-a-number',
    });
  });

  it('stores a date as its ISO string and rejects a malformed one', () => {
    expect(validateSignupAnswers([field({ type: 'date' })], { f1: '2026-09-01' })).toEqual({
      ok: true,
      value: { f1: '2026-09-01' },
    });
    expect(validateSignupAnswers([field({ type: 'date' })], { f1: '01/09/2026' })).toEqual({
      ok: false,
      fieldId: 'f1',
      reason: 'not-a-date',
    });
    expect(validateSignupAnswers([field({ type: 'date' })], { f1: '2026-13-40' })).toEqual({
      ok: false,
      fieldId: 'f1',
      reason: 'not-a-date',
    });
  });

  it('requires a select answer to be one of its options', () => {
    const spec = field({ type: 'select', options: ['S', 'M', 'L'] });
    expect(validateSignupAnswers([spec], { f1: 'M' })).toEqual({ ok: true, value: { f1: 'M' } });
    expect(validateSignupAnswers([spec], { f1: 'XL' })).toEqual({
      ok: false,
      fieldId: 'f1',
      reason: 'not-an-option',
    });
  });

  it('reads a required checkbox as "must be ticked"', () => {
    const spec = field({ type: 'checkbox', required: true });
    expect(validateSignupAnswers([spec], { f1: true })).toEqual({ ok: true, value: { f1: true } });
    expect(validateSignupAnswers([spec], { f1: false })).toEqual({
      ok: false,
      fieldId: 'f1',
      reason: 'required',
    });
    expect(validateSignupAnswers([spec], { f1: 'yes' })).toEqual({
      ok: false,
      fieldId: 'f1',
      reason: 'not-a-boolean',
    });
  });

  it('keeps an optional unticked checkbox out of the stored map', () => {
    const spec = field({ type: 'checkbox', required: false });
    expect(validateSignupAnswers([spec], { f1: false })).toEqual({ ok: true, value: { f1: false } });
  });

  it('rejects answers for a field the event does not declare', () => {
    expect(validateSignupAnswers([field()], { ghost: 'x' })).toEqual({
      ok: false,
      fieldId: 'ghost',
      reason: 'unknown-field',
    });
  });

  it('rejects more answers than the per-event cap', () => {
    const answers = Object.fromEntries(
      Array.from({ length: MAX_SIGNUP_FIELDS + 1 }, (_, i) => [`f${String(i)}`, 'x']),
    );
    expect(validateSignupAnswers([field()], answers)).toEqual({
      ok: false,
      fieldId: '',
      reason: 'too-many',
    });
  });
});

describe('isAdditiveSignupFieldChange', () => {
  const before = [field({ id: 'a' }), field({ id: 'b', type: 'number' })];

  it('allows appending a field', () => {
    expect(isAdditiveSignupFieldChange(before, [...before, field({ id: 'c' })])).toBe(true);
  });

  it('allows relabelling and toggling required in place', () => {
    const after = [field({ id: 'a', label: 'Nuevo', required: true }), before[1]];
    expect(isAdditiveSignupFieldChange(before, after)).toBe(true);
  });

  it('rejects removing, reordering, or retyping an existing field', () => {
    expect(isAdditiveSignupFieldChange(before, [before[0]])).toBe(false);
    expect(isAdditiveSignupFieldChange(before, [before[1], before[0]])).toBe(false);
    expect(isAdditiveSignupFieldChange(before, [field({ id: 'a', type: 'date' }), before[1]])).toBe(
      false,
    );
  });
});

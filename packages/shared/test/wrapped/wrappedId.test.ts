import { describe, expect, it } from 'vitest';
import { wrappedId, yearOfWrappedId } from '../../src/models/wrapped/WrappedDataModel';

describe('yearOfWrappedId', () => {
  it('reads the year back out of a Wrapped id', () => {
    expect(yearOfWrappedId(wrappedId('mun1', 2026))).toBe(2026);
    expect(yearOfWrappedId(wrappedId('a_b', 2025))).toBe(2025);
  });

  it('rejects anything that is not one', () => {
    expect(yearOfWrappedId('mun1')).toBeNull();
    expect(yearOfWrappedId('mun1_26')).toBeNull();
    expect(yearOfWrappedId(null)).toBeNull();
  });
});

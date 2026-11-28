import { describe, it, expect } from 'vitest';
import { copy } from '../../wrapped/render/copy';

// The «1 …» family on the Wrapped cards: each count agrees in number.
describe('Wrapped card copy agrees in number', () => {
  it.each([
    ['peopleTitle', copy.peopleTitle(1), '1 vecino', copy.peopleTitle(3), '3 vecinos'],
    ['peopleSubtitle', copy.peopleSubtitle(1), '1 se apuntó a algo', copy.peopleSubtitle(3), '3 se apuntaron a algo'],
    ['postersTitle', copy.postersTitle(1), '1 año de carteles', copy.postersTitle(3), '3 años de carteles'],
    ['statsFullestCount capped', copy.statsFullestCount(1, 1), '1 de 1 plaza', copy.statsFullestCount(2, 3), '2 de 3 plazas'],
    ['statsFullestCount uncapped', copy.statsFullestCount(1, null), '1 apuntado', copy.statsFullestCount(3, null), '3 apuntados'],
  ])('%s', (_name, one, expectedOne, other, expectedOther) => {
    expect(one).toBe(expectedOne);
    expect(other).toBe(expectedOther);
  });

  it('postersTitle keeps its no-span fallback', () => {
    expect(copy.postersTitle(0)).toBe('Los carteles');
  });
});

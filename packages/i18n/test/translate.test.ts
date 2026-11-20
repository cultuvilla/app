import { describe, it, expect } from 'vitest';
import { getMessages, translate } from '../index';

const plural = { n: '{count, plural, one {# opción} other {# opciones}}' };

describe('translate', () => {
  it('walks a dotted key', () => {
    expect(translate({ feed: { title: 'Eventos' } }, 'feed.title')).toBe('Eventos');
  });

  it('returns the key itself when missing, or when it names a branch', () => {
    expect(translate({}, 'missing.key')).toBe('missing.key');
    expect(translate({ feed: { title: 'Eventos' } }, 'feed')).toBe('feed');
  });

  it('interpolates {placeholders} and leaves unknown ones', () => {
    expect(translate({ g: 'Hola {name}, {other}' }, 'g', { name: 'Álvaro' })).toBe('Hola Álvaro, {other}');
  });

  it('selects the "one" ICU plural form and substitutes #', () => {
    expect(translate(plural, 'n', { count: 1 })).toBe('1 opción');
  });

  it('selects the "other" ICU plural form for n != 1', () => {
    expect(translate(plural, 'n', { count: 3 })).toBe('3 opciones');
    expect(translate(plural, 'n', { count: 0 })).toBe('0 opciones');
  });

  it('handles an ICU plural block followed by trailing text', () => {
    const m = { b: '{count, plural, one {# vecino ha respondido} other {# vecinos han respondido}} esta pregunta.' };
    expect(translate(m, 'b', { count: 1 })).toBe('1 vecino ha respondido esta pregunta.');
    expect(translate(m, 'b', { count: 2 })).toBe('2 vecinos han respondido esta pregunta.');
  });

  it('agrees in number on the counts the read site prints', () => {
    const es = getMessages('es');
    expect(translate(es, 'organization.membersCount', { count: 1 })).toBe('1 integrante');
    expect(translate(es, 'organization.membersCount', { count: 4 })).toBe('4 integrantes');
    expect(translate(es, 'village.admin.barrios.residentCount', { count: 1 })).toBe('1 vecino');
  });
});

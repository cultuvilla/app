import { describe, it, expect } from 'vitest';
import { getMessages, stripPlurals, SUPPORTED_LOCALES } from '../index';

/**
 * The net under «1 personas». A message that puts a count next to a plural
 * word must say it through an ICU plural (`{n, plural, one {…} other {…}}`),
 * and every plural must be one `format` can parse — anything else renders
 * wrong for n = 1, or as raw ICU text. The exact wording of the keys that
 * were fixed stays pinned in apps/mobile/lib/__tests__/catalogCopy.test.ts.
 */

/** Keys the rule flags that are not counts. A stale entry fails the suite. */
const ALLOW: Record<string, string> = {
  'groups.tasks.dueAt': 'a las {time}: an hour, not a count',
  'groups.cosateca.reserva.confirmBody': 'a las {time}: an hour, not a count',
};

// A placeholder followed (optionally after «de») by a lowercase word ending
// in -s: «{count} personas», «de {count} pagadas».
const BARE_PLURAL_NOUN = /\{\w+\}\s+(?:de\s+)?\p{Ll}*s(?!\p{L})/gu;
// A placeholder after a plural determiner: «Ver las {count}».
const PLURAL_DETERMINER = /(?<!\p{L})(?:las|los|unos|unas)\s+\{\w+\}/giu;

function flatten(obj: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (node: Record<string, unknown>, prefix: string): void => {
    for (const [key, value] of Object.entries(node)) {
      const path = prefix ? `${prefix}.${key}` : key;
      if (typeof value === 'string') out[path] = value;
      else if (value !== null && typeof value === 'object') walk(value as Record<string, unknown>, path);
    }
  };
  walk(obj, '');
  return out;
}

interface Finding {
  key: string;
  problem: 'unparsed-plural' | 'bare-count';
  span: string;
}

function findCountProblems(leaves: Record<string, string>): Finding[] {
  const findings: Finding[] = [];
  for (const [key, tpl] of Object.entries(leaves)) {
    const rest = stripPlurals(tpl);
    if (rest.includes('plural,')) {
      findings.push({ key, problem: 'unparsed-plural', span: tpl });
      continue;
    }
    // A key-pair plural (`x.one` / `x.other`, picked by the caller on
    // count === 1) is plural by construction.
    if (key.endsWith('.other') && `${key.slice(0, -'other'.length)}one` in leaves) continue;
    for (const re of [BARE_PLURAL_NOUN, PLURAL_DETERMINER]) {
      for (const m of rest.matchAll(re)) findings.push({ key, problem: 'bare-count', span: m[0] });
    }
  }
  return findings;
}

/** ALLOW keys that are gone from the catalog, or that the rule no longer flags. */
function staleAllowEntries(leaves: Record<string, string>, allow: Record<string, string>): string[] {
  const flagged = new Set(findCountProblems(leaves).map((f) => f.key));
  return Object.keys(allow).filter((key) => !(key in leaves) || !flagged.has(key));
}

function describeFinding(f: Finding): string {
  return f.problem === 'unparsed-plural'
    ? `${f.key}: «${f.span}» has a plural format() cannot parse — only {x, plural, one {…} other {…}}, no =0, no nested braces`
    : `${f.key}: «${f.span}» puts a count next to a plural word — wrap it as {x, plural, one {…} other {…}}, or add the key to ALLOW with a reason`;
}

describe('count plurals in the catalog', () => {
  for (const locale of SUPPORTED_LOCALES) {
    const leaves = flatten(getMessages(locale));

    it(`${locale}: every count agrees in number and every plural parses`, () => {
      const problems = findCountProblems(leaves)
        .filter((f) => f.problem === 'unparsed-plural' || !(f.key in ALLOW))
        .map(describeFinding);
      expect(problems).toEqual([]);
    });

    it(`${locale}: every ALLOW entry exists and still trips the rule`, () => {
      expect(staleAllowEntries(leaves, ALLOW)).toEqual([]);
    });
  }
});

describe('the rule itself', () => {
  it('flags a bare count before a plural noun', () => {
    expect(findCountProblems({ a: '{count} personas', b: 'Pagadas {n} de {total} plazas' })).toEqual([
      { key: 'a', problem: 'bare-count', span: '{count} personas' },
      { key: 'b', problem: 'bare-count', span: '{total} plazas' },
    ]);
  });

  it('flags a count after a plural determiner', () => {
    expect(findCountProblems({ a: 'Ver las {count}' })).toEqual([
      { key: 'a', problem: 'bare-count', span: 'las {count}' },
    ]);
  });

  it('flags a plural the formatter cannot parse', () => {
    expect(
      findCountProblems({ a: '{count, plural, =0 {Nadie} one {1 asistente} other {# asistentes}}' }),
    ).toEqual([
      { key: 'a', problem: 'unparsed-plural', span: '{count, plural, =0 {Nadie} one {1 asistente} other {# asistentes}}' },
    ]);
  });

  it('passes a parseable plural, a label, an accented verb and a key-pair plural', () => {
    expect(
      findCountProblems({
        a: '{count, plural, one {# persona} other {# personas}}',
        b: 'Activos {count}',
        c: '{name} pasó a plaza confirmada',
        'd.one': '1 persona',
        'd.other': '{count} personas',
      }),
    ).toEqual([]);
  });

  it('treats an ALLOW entry that is missing or no longer flagged as stale', () => {
    const allow = { kept: 'an hour', fixed: 'an hour', gone: 'an hour' };
    const leaves = { kept: '{date} a las {time}', fixed: '{date}, {time}' };
    expect(staleAllowEntries(leaves, allow)).toEqual(['fixed', 'gone']);
  });
});

import { describe, it, expect, afterAll } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The native E2E suite was green while whole forms shipped untested: each flow
// walked the shortest path on defaults, and nothing measured what it skipped.
// This is that measurement, as a ratchet. Every testID in the app is either
// touched by a Maestro flow or listed in apps/mobile/e2e/native/uncovered.json,
// and that list may only shrink. See docs/plans/ongoing/e2e-full-feature-coverage.md.
//
// After a flow covers more: `node scripts/lib/e2e-coverage.mjs --write`.

const repoRoot = resolve(__dirname, '../../../..');

interface SourceId {
  prefix: boolean;
  files: Set<string>;
}
interface Ref {
  value: string;
  key: string;
  file: string;
}
const lib = (await import(pathToFileURL(resolve(repoRoot, 'scripts/lib/e2e-coverage.mjs')).href)) as {
  sourceTestIds: (files?: string[]) => Map<string, SourceId>;
  flowRefs: () => Ref[];
  coverage: (
    ids?: Map<string, SourceId>,
    refs?: Ref[],
  ) => { covered: Set<string>; uncovered: Set<string>; dangling: Ref[] };
  controlsWithoutTestId: (files?: string[], root?: string) => { file: string; line: number; control: string }[];
  readUncovered: () => Record<string, string>;
};

const ids = lib.sourceTestIds();
const refs = lib.flowRefs();
const { covered, uncovered, dangling } = lib.coverage(ids, refs);
const listed = lib.readUncovered();

const REGENERATE = 'run `node scripts/lib/e2e-coverage.mjs --write`';

describe('native E2E coverage ratchet', () => {
  it('sees the app and the flows at all', () => {
    expect(ids.size).toBeGreaterThan(200);
    expect(covered.size).toBeGreaterThan(50);
  });

  it('every testID is touched by a flow or listed as a known gap', () => {
    const unlisted = [...uncovered].filter((k) => !(k in listed));
    expect(unlisted, `untested controls: cover them in a flow, or ${REGENERATE}`).toEqual([]);
  });

  // The ratchet: an entry that a flow now covers, or whose control is gone,
  // must leave the list, so the list can only shrink.
  it('the gap list holds only real, uncovered ids', () => {
    const stale = Object.keys(listed).filter((k) => !uncovered.has(k));
    expect(stale, `now covered or deleted — ${REGENERATE}`).toEqual([]);
  });

  // A gap is either proven elsewhere or impossible to drive on a device. A
  // `todo:` was the backlog while the suite was being built; the regenerator
  // still writes one for a new control, and this fails until it is resolved.
  it('each gap says why', () => {
    const bad = Object.entries(listed).filter(([, why]) => !/^(unit-tested|device-only): \S/.test(why));
    expect(bad, 'reasons are `unit-tested: <test>` or `device-only: <why>` — cover a `todo:` in a flow').toEqual([]);
  });

  it('a unit-tested gap names a test that exercises it', () => {
    const missing = Object.entries(listed).flatMap(([key, why]) => {
      if (!why.startsWith('unit-tested: ')) return [];
      const path = resolve(repoRoot, 'apps/mobile', why.slice('unit-tested: '.length));
      if (!existsSync(path)) return [`${key}: ${path} does not exist`];
      const literal = key.split(/\$\{|\*/)[0];
      return readFileSync(path, 'utf8').includes(literal) ? [] : [`${key}: not referenced in ${why}`];
    });
    expect(missing).toEqual([]);
  });

  // A renamed control otherwise surfaces only as a slow timeout on a device.
  it('every id a flow taps exists in the app', () => {
    expect(dangling.map((r) => `${r.file}: ${r.key}: ${r.value}`)).toEqual([]);
  });

  // The ratchet only sees controls that carry a testID, so a field added
  // without one would be invisible to it.
  it('every control on a form surface carries a testID', () => {
    expect(lib.controlsWithoutTestId().map((m) => `${m.file}:${String(m.line)} <${m.control}>`)).toEqual([]);
  });
});

describe('testID extraction', () => {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-coverage-'));
  afterAll(() => {
    rmSync(dir, { recursive: true, force: true });
  });
  const extract = (source: string) => {
    const file = join(dir, `Sample${Math.random().toString(36).slice(2)}.tsx`);
    writeFileSync(file, source);
    return [...lib.sourceTestIds([file]).keys()].sort();
  };

  it('reads literal ids in every quoting style', () => {
    expect(extract(`<A testID="a" /><B testID={'b'} /><C primaryTestID="c" />{ testID: 'd' }`)).toEqual([
      'a',
      'b',
      'c',
      'd',
    ]);
  });

  it('turns a template id into a prefix', () => {
    expect(extract('<A testID={`row-${id}`} />')).toEqual(['row-*']);
  });

  it('treats a …TestIDPrefix prop as a prefix', () => {
    expect(extract('<A testIDPrefix="news-block" />')).toEqual(['news-block*']);
  });

  it('reads both arms of a ternary', () => {
    expect(extract(`const p = { testID: i === 0 ? 'fab' : 'fab-waitlist' };`)).toEqual(['fab', 'fab-waitlist']);
  });

  // `${testID}-date` is the caller's id plus a suffix; the caller's literal counts.
  it('skips ids with no literal head', () => {
    expect(extract('<A testID={testID} /><B testID={`${testID}-date`} />')).toEqual([]);
  });

  it('matches a flow id with a variable against a prefix', () => {
    const sample = new Map([['row-*', { prefix: true, files: new Set(['x']) }]]);
    const { covered: hit } = lib.coverage(sample, [{ value: 'row-${PERSON}', key: 'id', file: 'f' }]);
    expect([...hit]).toEqual(['row-*']);
  });
});

describe('form controls without a testID', () => {
  const root = mkdtempSync(join(tmpdir(), 'e2e-controls-'));
  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });
  const misses = (rel: string, source: string) => {
    const file = join(root, rel);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, source);
    return lib.controlsWithoutTestId([file], root).map((m) => m.control);
  };

  it('flags an input with no testID on a form surface', () => {
    expect(misses('app/crear/a.tsx', '<Input value={v} onChangeText={set} />')).toEqual(['Input']);
  });

  // A spread may or may not carry one, and an id hidden in a hook's props is
  // invisible to the ratchet either way.
  it('does not take a spread as a testID', () => {
    expect(misses('app/crear/b.tsx', '<PhoneField {...phone.fieldProps} />')).toEqual(['PhoneField']);
  });

  it('accepts an explicit testID, or a …TestIDPrefix', () => {
    expect(misses('app/crear/c.tsx', '<Input testID="t" /><OptionsEditor testIDPrefix="q" />')).toEqual([]);
  });

  // The tag ends at the first `>` outside braces, so an arrow in a prop does not
  // cut it off before the testID.
  it('reads past an arrow function in an earlier prop', () => {
    expect(misses('app/crear/d.tsx', '<Input onChangeText={(v) => set(v)} testID="t" />')).toEqual([]);
  });

  it('ignores files that are not form surfaces', () => {
    expect(misses('components/feature/Feed.tsx', '<Input value={v} />')).toEqual([]);
  });
});

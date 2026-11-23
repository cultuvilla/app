import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Every service file had a test, yet 156 of 400 exports were named by none —
// write paths with real logic among them. This ratchet keeps it from growing:
// every export under packages/shared/src/services/ is referenced by a test in
// packages/shared/test/ or functions/src/__tests__/, or is listed in
// packages/shared/test/services/untested-exports.json, and that list may only
// shrink. See .agents/skills/touch-service/SKILL.md (step 14).

const repoRoot = resolve(__dirname, '../../../..');

type List = Record<string, string[]>;
const lib = (await import(pathToFileURL(resolve(repoRoot, 'scripts/lib/service-test-coverage.mjs')).href)) as {
  serviceExports: () => List;
  untestedExports: (exports?: List, ids?: Set<string>) => List;
  testIdentifiers: () => Set<string>;
  stripComments: (source: string) => string;
  readList: () => List;
  keys: (list: List) => string[];
};

const exportsFound = lib.serviceExports();
const untested = new Set(lib.keys(lib.untestedExports(exportsFound)));
const listed = lib.readList();
const listedKeys = lib.keys(listed);

const REGENERATE = 'node scripts/lib/service-test-coverage.mjs --write';

describe('service export test ratchet', () => {
  it('sees the services and the tests at all', () => {
    expect(lib.keys(exportsFound).length).toBeGreaterThan(300);
    expect(untested.size).toBeLessThan(lib.keys(exportsFound).length / 2);
  });

  it('every new service export ships with a test', () => {
    const unlisted = [...untested].filter((k) => !listedKeys.includes(k));
    expect(
      unlisted,
      'new service export(s) that no test names. Add a vitest under packages/shared/test/services/ ' +
        'that calls each one. If it is a thin wrapper with nothing worth asserting, list it instead: ' +
        `\`${REGENERATE}\`. On a rebase conflict in untested-exports.json, take either side and re-run that command.`,
    ).toEqual([]);
  });

  // The ratchet: an export a test now names, or one that was deleted, must
  // leave the list, so the list can only shrink.
  it('the list holds only real, untested exports', () => {
    const stale = listedKeys.filter((k) => !untested.has(k));
    expect(stale, `now tested or deleted — run \`${REGENERATE}\` and commit the shorter list`).toEqual([]);
  });

  it('the list is sorted and grouped by file, as --write writes it', () => {
    expect(listed).toEqual(lib.untestedExports(exportsFound));
    expect(Object.keys(listed)).toEqual([...Object.keys(listed)].sort());
  });

  it('a name only in a comment does not count as tested', () => {
    const ids = new Set(
      lib.stripComments('// createThing is untested\n/* nor deleteThing */\nconst url = "https://x"; updateThing();')
        .match(/[A-Za-z_$][\w$]*/g),
    );
    expect(lib.untestedExports({ 'x.ts': ['createThing', 'deleteThing', 'updateThing'] }, ids)).toEqual({
      'x.ts': ['createThing', 'deleteThing'],
    });
  });
});

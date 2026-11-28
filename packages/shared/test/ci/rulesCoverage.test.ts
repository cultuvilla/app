import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// The rules coverage ratchet (scripts/check-rules-coverage.mjs) runs after the
// rules suite and fails on an `allow` condition no test has seen both grant and
// refuse. This pins its logic on a small fake rules file and fake reports; the
// real measurement needs the emulator and runs in `test:rules`.
// See docs/plans/ongoing/rules-coverage-ratchet.md.

const repoRoot = resolve(__dirname, '../../../..');

interface Condition {
  key: string;
  start: number;
  end: number;
  constant: boolean;
}
interface Entry {
  line: number;
  column: number;
  trueCount: number;
  falseCount: number;
  errorCount: number;
}
type Merged = Map<string, Condition & { evaluated: boolean; sawTrue: boolean; sawFalse: boolean }>;
const lib = (await import(pathToFileURL(resolve(repoRoot, 'scripts/lib/rules-coverage.mjs')).href)) as {
  rulesPath: string;
  uncoveredPath: string;
  parseRules: (text: string) => Condition[];
  mergeCoverage: (text: string, conditions: Condition[], reports: { entries: Entry[] }[]) => Merged;
  gaps: (merged: Merged) => Map<string, string>;
  check: (
    gaps: Map<string, string>,
    listed: Record<string, string>,
    conditions: Condition[],
  ) => { unlisted: string[]; stale: string[]; missing: string[]; wrongKind: { key: string }[] };
  readUncovered: () => Record<string, string>;
};

const RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    function isOwner(uid) { return request.auth.uid == uid; }
    // allow write: if a comment { is not a rule
    match /things/{thingId} {
      allow read: if true;
      allow create, update: if isOwner(request.resource.data.ownerId)
        && request.resource.data.name == 'a;b{';
      allow delete: if isOwner(resource.data.ownerId);
      match /parts/{partId} {
        allow read: if isOwner(thingId);
        allow read: if resource.data.open == true;
      }
    }
    match /{path=**}/parts/{partId} {
      allow list: if isOwner(resource.data.ownerId);
    }
  }
}
`;

// The column of `needle`'s first character on 1-based `line`.
function at(line: number, needle: string): { line: number; column: number } {
  const column = RULES.split('\n')[line - 1].indexOf(needle) + 1;
  if (column === 0) throw new Error(`${needle} not on line ${String(line)}`);
  return { line, column };
}
const entry = (pos: { line: number; column: number }, t: number, f: number, e = 0): Entry => ({
  ...pos,
  trueCount: t,
  falseCount: f,
  errorCount: e,
});

const conditions = lib.parseRules(RULES);

describe('rules coverage ratchet', () => {
  it('keys each allow condition by match path and operations, never by line', () => {
    expect(conditions.map((c) => [c.key, c.constant])).toEqual([
      ['/things/{thingId} read', true],
      ['/things/{thingId} create, update', false],
      ['/things/{thingId} delete', false],
      ['/things/{thingId}/parts/{partId} read', false],
      ['/things/{thingId}/parts/{partId} read #2', false],
      ['/{path=**}/parts/{partId} list', false],
    ]);
  });

  it('judges conditions only, both ways, and does not count an error as a refusal', () => {
    const reports = [
      {
        entries: [
          entry(at(4, 'request.auth.uid'), 5, 0), // a function body: ignored
          entry(at(8, 'isOwner(request'), 2, 1),
          entry(at(10, 'isOwner(resource'), 1, 0, 3),
        ],
      },
      { entries: [entry(at(12, 'isOwner(thingId)'), 0, 2)] },
      { entries: [entry(at(10, 'isOwner(resource'), 1, 0)] },
    ];
    const gaps = lib.gaps(lib.mergeCoverage(RULES, conditions, reports));
    expect(Object.fromEntries(gaps)).toEqual({
      '/things/{thingId} delete': 'never-false',
      '/things/{thingId}/parts/{partId} read': 'never-true',
      '/things/{thingId}/parts/{partId} read #2': 'never-evaluated',
      '/{path=**}/parts/{partId} list': 'never-evaluated',
    });
  });

  it('fails on an unlisted gap, a stale entry, a vanished key and a wrong reason', () => {
    const gaps = new Map([
      ['/things/{thingId} delete', 'never-false'],
      ['/{path=**}/parts/{partId} list', 'never-evaluated'],
    ]);
    const result = lib.check(
      gaps,
      {
        '/{path=**}/parts/{partId} list': 'never-true: wrong kind',
        '/things/{thingId} create, update': 'never-false: now covered',
        '/gone/{id} read': 'never-evaluated: deleted rule',
      },
      conditions,
    );
    expect(result.unlisted).toEqual(['/things/{thingId} delete']);
    expect(result.stale).toEqual(['/things/{thingId} create, update']);
    expect(result.missing).toEqual(['/gone/{id} read']);
    expect(result.wrongKind.map((w) => w.key)).toEqual(['/{path=**}/parts/{partId} list']);
  });

  it('every listed gap names a key the real rules still have, with a reason', () => {
    const keys = new Set(lib.parseRules(readFileSync(lib.rulesPath, 'utf8')).map((c) => c.key));
    expect(keys.size).toBeGreaterThan(150);
    for (const [key, reason] of Object.entries(lib.readUncovered())) {
      expect(keys.has(key), key).toBe(true);
      expect(reason, key).toMatch(/^never-(evaluated|true|false): \S/);
    }
  });
});

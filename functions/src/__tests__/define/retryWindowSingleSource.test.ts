// Every retry bound a trigger declares is a `TRIGGER_RETRY_WINDOW_MS` key.
// The seam's own tests pin each window's value, so they would pass just as well
// for a trigger that writes `60 * 60 * 1000` itself — which is how a trigger
// came to carry a RETRY_WINDOW_MS of its own. This reads the source instead.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = resolve(__dirname, '../..');
const SKIPPED_DIRS = new Set(['__tests__', 'define']);

const tsFilesUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return SKIPPED_DIRS.has(name) ? [] : tsFilesUnder(path);
    return name.endsWith('.ts') && !name.endsWith('.d.ts') ? [path] : [];
  });

const sources = () => tsFilesUnder(SRC).map((path) => ({ file: relative(SRC, path), text: readFileSync(path, 'utf8') }));

describe('retry windows come from TRIGGER_RETRY_WINDOW_MS', () => {
  it('finds the triggers it guards, so a moved source tree cannot make it vacuous', () => {
    expect(sources().some(({ text }) => /maxEventAgeMs:/.test(text))).toBe(true);
  });

  it('no trigger outside shared/define names a duration of its own', () => {
    const own = sources().flatMap(({ file, text }) =>
      [...text.matchAll(/maxEventAgeMs:\s*([^,}\n]+)/g)]
        .map((match) => ({ file, value: match[1].trim() }))
        .filter(({ value }) => !value.startsWith('TRIGGER_RETRY_WINDOW_MS.')),
    );
    expect(own).toEqual([]);
  });

  it('no second copy of the window constant exists', () => {
    const copies = sources()
      .filter(({ text }) => /\bRETRY_WINDOW(_MS)?\s*=/.test(text))
      .map(({ file }) => file);
    expect(copies).toEqual([]);
  });
});

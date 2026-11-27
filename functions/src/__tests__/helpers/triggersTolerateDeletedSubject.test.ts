import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

// A trigger's subject can be deleted between the write that fired it and the
// handler's own update, and an unhandled NOT_FOUND fails the run. So NOT_FOUND
// has one helper, src/shared/notFound.ts, and every `.update(` in a trigger or
// schedule either goes through `updateIfStillExists`, runs inside a
// transaction (which reads the doc first and skips it when absent), or is
// listed below with the reason it cannot meet a deleted document.
// See docs/decisions/triggers-tolerate-a-deleted-subject.md.
//
// It is a text scan, so it sees only the files that define the function;
// a helper module a trigger calls is reviewed by hand.

const FUNCTIONS_SRC = resolve(__dirname, '../..');
const HELPER = 'shared/notFound.ts';

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === '__tests__' || entry === 'node_modules') continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listSourceFiles(full));
    else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(full);
  }
  return out;
}

/** `.update(` calls that are safe without the helper, and why. Matched by file and line text. */
const ALLOWED: { file: string; line: RegExp; why: string }[] = [
  {
    file: 'interaction/syncEntityInteractionCounts.ts',
    line: /^case '\w+':\s+await \w+\(db, .*\)\.update\(field, value, \.\.\.more\); break;$/,
    why: 'applyToParent catches NOT_FOUND with the shared isNotFound and reports it as "not-found"',
  },
  {
    file: 'events/eventCompletion.ts',
    line: /^\.update\(event\.ref, /,
    why: "a BulkWriter write: onWriteError counts NOT_FOUND as deleted, and the write's own promise is caught",
  },
];

function isComment(line: string): boolean {
  return line.startsWith('//') || line.startsWith('*') || line.startsWith('/*');
}

describe('triggers tolerate a deleted subject', () => {
  const files = listSourceFiles(FUNCTIONS_SRC).map((full) => ({
    rel: relative(FUNCTIONS_SRC, full),
    text: readFileSync(full, 'utf-8'),
  }));

  it('keeps one NOT_FOUND predicate, in src/shared/notFound.ts', () => {
    const offenders: string[] = [];
    for (const { rel, text } of files) {
      if (rel === HELPER) continue;
      text.split('\n').forEach((line, idx) => {
        if (/function isNotFound\b|\bcode\s*===?\s*5\b|\bcode\s*===?\s*'NOT_FOUND'/.test(line)) {
          offenders.push(`${rel}:${String(idx + 1)}: ${line.trim()}`);
        }
      });
    }
    expect(offenders, ['Import isNotFound / updateIfStillExists from src/shared/notFound.ts instead:', ...offenders].join('\n')).toEqual([]);
  });

  it('routes every trigger update through updateIfStillExists, a transaction, or a listed reason', () => {
    const offenders: string[] = [];
    for (const { rel, text } of files) {
      if (!/\bdefine(DocumentTrigger|Schedule)\(/.test(text)) continue;
      const lines = text.split('\n');
      for (const match of text.matchAll(/\.update\(/g)) {
        const at = match.index;
        const lineNo = text.slice(0, at).split('\n').length;
        const line = lines[lineNo - 1].trim();
        if (isComment(line)) continue;
        if (/\b(tx|transaction)\s*$/.test(text.slice(Math.max(0, at - 30), at))) continue;
        const before = text.slice(Math.max(0, at - 250), at);
        const helperAt = before.lastIndexOf('updateIfStillExists(');
        if (helperAt >= 0 && !before.slice(helperAt).includes(';')) continue;
        if (ALLOWED.some((a) => a.file === rel && a.line.test(line))) continue;
        offenders.push(`${rel}:${String(lineNo)}: ${line}`);
      }
    }
    expect(
      offenders,
      [
        'A trigger updated a document that can be deleted under it. Wrap the write:',
        '',
        "  import { updateIfStillExists } from '../shared/notFound';",
        '  await updateIfStillExists(() => ref.update(patch), { handler, path: ref.path });',
        '',
        'or, if it provably cannot meet a deleted document, add it to ALLOWED with why.',
        '',
        ...offenders,
      ].join('\n'),
    ).toEqual([]);
  });

  it('lists no allowance that matches nothing', () => {
    const stale = ALLOWED.filter(
      (a) => !files.some((f) => f.rel === a.file && f.text.split('\n').some((l) => a.line.test(l.trim()))),
    );
    expect(stale.map((a) => a.file)).toEqual([]);
  });
});

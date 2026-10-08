import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// storage.rules never reads Firestore. Cross-service firestore.get/exists is
// allowed by the emulator and denied by every deployed project (dev, beta and
// prod alike), so a rule that uses it passes storageRules.test.ts and refuses
// every real upload — 2026-10-07, every event cover in prod. Authority over an
// image lives where the image is attached: the Firestore rules of the doc that
// points at it, or the callable that writes it (ordago's convention).

const repoRoot = resolve(__dirname, '../../../..');
const rules = readFileSync(resolve(repoRoot, 'storage.rules'), 'utf-8');

function code(src: string): string {
  return src
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');
}

describe('storage.rules', () => {
  it('never reads Firestore (cross-service rules fail only once deployed)', () => {
    expect(code(rules)).not.toMatch(/\bfirestore\s*\.\s*(get|exists)\s*\(/);
  });

  it('the check sees through formatting but not comments', () => {
    expect(code('allow write: if firestore . exists(/x);')).toMatch(/\bfirestore\s*\.\s*(get|exists)\s*\(/);
    expect(code('// firestore.get( is mentioned in a comment')).not.toMatch(/\bfirestore\s*\.\s*(get|exists)\s*\(/);
  });
});

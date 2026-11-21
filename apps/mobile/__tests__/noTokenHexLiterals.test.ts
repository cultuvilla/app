import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { colors, palette } from '@cultuvilla/shared/design-system';

// Ionicons `color`, ActivityIndicator, placeholderTextColor, tab bar tints and
// StyleSheet objects sit where NativeWind classes cannot reach, so colours there
// were typed by hand. A hand-typed hex does not follow a brand change or the
// dark mode colors.ts promises; a token does. This fails on any quoted hex in
// app/ or components/: one that equals a token names the token to read, and
// one that matches none needs a token first (shadows read elevation's colour).

const MOBILE = join(__dirname, '..');
const ROOTS = ['components', 'app'].map((dir) => join(MOBILE, dir));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

function normaliseHex(hex: string): string {
  const lower = hex.toLowerCase();
  return lower.length === 4 ? `#${[...lower.slice(1)].map((c) => c + c).join('')}` : lower;
}

/** Every token value → the token paths that carry it. */
function tokenIndex(): Map<string, string[]> {
  const index = new Map<string, string[]>();
  const add = (value: string, path: string) => {
    const key = normaliseHex(value);
    index.set(key, [...(index.get(key) ?? []), path]);
  };
  for (const [name, value] of Object.entries(palette)) add(value, `palette.${name}`);
  for (const [group, tokens] of Object.entries(colors.light)) {
    for (const [name, value] of Object.entries(tokens)) add(value, `colors.light.${group}['${name}']`);
  }
  return index;
}

const QUOTED_HEX = /(['"`])(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})\1/g;

describe('no hand-typed hex colours', () => {
  it('finds source files to scan', () => {
    expect(ROOTS.flatMap(sourceFiles).length).toBeGreaterThan(50);
  });

  it('reads tokens instead of hand-typing hex values', () => {
    const index = tokenIndex();
    const offenders = ROOTS.flatMap(sourceFiles).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          [...line.matchAll(QUOTED_HEX)].flatMap((m) => {
            const tokens = index.get(normaliseHex(m[2] ?? ''));
            const hint = tokens ? tokens.join(' | ') : 'no token: add one to colors.ts';
            return [`${relative(MOBILE, file)}:${i + 1} ${m[2]} → ${hint}`];
          }),
        ),
    );
    expect(offenders).toEqual([]);
  });
});

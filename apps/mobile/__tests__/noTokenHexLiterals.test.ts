import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { colors, palette } from '@cultuvilla/shared/design-system';

// Ionicons `color`, ActivityIndicator, placeholderTextColor, tab bar tints and
// StyleSheet objects sit where NativeWind classes cannot reach, so colours there
// were typed by hand, 79 of them byte-for-byte copies of a design token. A copy
// does not follow a brand change or the dark mode colors.ts promises; the token
// does. This fails on any quoted hex in app/ or components/ that equals a token
// and names the token to read instead. Hexes that match no token (the neutral
// greys, black scrims) are a design call and are not covered here.

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

describe('no hand-copied colour tokens', () => {
  it('finds source files to scan', () => {
    expect(ROOTS.flatMap(sourceFiles).length).toBeGreaterThan(50);
  });

  it('reads tokens instead of copying their hex values', () => {
    const index = tokenIndex();
    const offenders = ROOTS.flatMap(sourceFiles).flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) =>
          [...line.matchAll(QUOTED_HEX)].flatMap((m) => {
            const tokens = index.get(normaliseHex(m[2] ?? ''));
            return tokens
              ? [`${relative(MOBILE, file)}:${i + 1} ${m[2]} → ${tokens.join(' | ')}`]
              : [];
          }),
        ),
    );
    expect(offenders).toEqual([]);
  });
});

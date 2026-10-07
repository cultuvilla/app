// Pins the lint rule that keeps client Firebase behind the SDK seam
// (src/firebase/sdk/README.md). Weakening it would let a service import
// `firebase/*` directly and put the JS SDK — without the native Auth session —
// back into the app bundle.
import { describe, expect, it } from 'vitest';
import config from '../../eslint.config.mjs';

interface Block {
  files?: string[];
  ignores?: string[];
  rules?: Record<string, unknown>;
}

const block = (config as Block[]).find((b) => b.rules?.['@typescript-eslint/no-restricted-imports'] !== undefined);

describe('SDK seam lint rule', () => {
  it('forbids JS and native Firebase SDK imports across src, type imports aside', () => {
    expect(block?.files).toEqual(['src/**/*.ts']);
    const [severity, options] = block?.rules?.['@typescript-eslint/no-restricted-imports'] as [
      string,
      { patterns: { group: string[]; allowTypeImports: boolean }[] },
    ];
    expect(severity).toBe('error');
    expect(options.patterns[0]?.group).toEqual(['firebase/*', '@firebase/*', '@react-native-firebase/*']);
    expect(options.patterns[0]?.allowTypeImports).toBe(true);
  });

  it('exempts only the seam itself and the app bootstrap', () => {
    expect(block?.ignores).toEqual(['src/firebase/sdk/**', 'src/firebase/firebaseApp*.ts']);
  });
});

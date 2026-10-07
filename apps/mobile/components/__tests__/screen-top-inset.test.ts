import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

/**
 * `<Screen topInset={false}>` hands the status-bar inset to the screen's own
 * top chrome. Only chrome that pads by `insets.top` itself can take it: the
 * accent `ScreenHeader`, `AppHeader`, `EntityDetailHeader` and the Wrapped
 * story viewer. A plain `ScreenHeader` does not, so pairing it with
 * `topInset={false}` draws the header under the clock and notification icons —
 * which is how a visited village's header ended up behind the status bar.
 */
const SCREEN_WITHOUT_TOP_INSET = /<Screen\b[^>]*topInset=\{false\}[^>]*>/g;
const FIRST_CHROME = /<(ScreenHeader|AppHeader|EntityDetailHeader|WrappedStoryViewer)\b([^>]*?)\/?>/s;

function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', 'app', 'components'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\n')
    .filter((f) => /\.tsx$/.test(f) && !f.includes('__tests__'));
}

describe('Screen top inset', () => {
  it('opts out of the top inset only when its header claims the inset itself', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles()) {
      const src = readFileSync(path.join(ROOT, file), 'utf8');
      for (const match of src.matchAll(SCREEN_WITHOUT_TOP_INSET)) {
        const after = src.slice(match.index + match[0].length);
        const chrome = FIRST_CHROME.exec(after);
        const claimsInset =
          chrome != null && (chrome[1] !== 'ScreenHeader' || /\baccent\b/.test(chrome[2] ?? ''));
        if (!claimsInset) {
          const line = src.slice(0, match.index).split('\n').length;
          offenders.push(`${file}:${line}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});

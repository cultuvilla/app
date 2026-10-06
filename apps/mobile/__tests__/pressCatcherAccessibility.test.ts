import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';

// A sheet or dialog here is a backdrop Pressable (tap outside → dismiss)
// wrapping a "press-catcher" Pressable with a no-op onPress (tap inside → stay
// open). A Pressable is an accessibility element by default, and on iOS an
// accessibility element HIDES ITS DESCENDANTS: the whole card — every row,
// checkbox and button — collapsed into one VoiceOver element that nobody could
// operate, and that XCUITest (and so the iOS Maestro suite) could not see
// into. Both wrappers must be `accessible={false}`: they exist for touch
// routing, not as controls.
//
// InfoTooltip is the one exception: its backdrop is labelled as the close
// control and its card is read-only text.

const MOBILE = join(__dirname, '..');
// Screens hand-roll sheets too (the burial editor in lugar/[lugar].tsx), so the
// scan covers app/ as well as components/.
const ROOTS = ['components', 'app'].map((dir) => join(MOBILE, dir));
const EXEMPT = new Set(['components/primitives/InfoTooltip.tsx']);

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return name === '__tests__' ? [] : tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

const OPENING = /<(RNPressable|Pressable)\b/g;

/** The opening tag (up to its closing `>`) of each Pressable in `source`. */
function pressableTags(source: string): { at: number; tag: string }[] {
  return [...source.matchAll(OPENING)].map((m) => {
    const at = m.index ?? 0;
    let depth = 0;
    let end = at;
    for (; end < source.length; end++) {
      const ch = source[end];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      else if (ch === '>' && depth === 0 && source[end - 1] !== '=') break;
    }
    return { at, tag: source.slice(at, end + 1) };
  });
}

describe('modal press-catchers stay out of the accessibility tree', () => {
  const files = ROOTS.flatMap(tsxFiles).filter((f) => !EXEMPT.has(relative(MOBILE, f)));

  it('finds the sheets it guards', () => {
    const withCatcher = files.filter((f) => readFileSync(f, 'utf8').includes('onPress={() => {}}'));
    expect(withCatcher.length).toBeGreaterThanOrEqual(10);
  });

  it.each(files.map((f) => [relative(MOBILE, f), f]))('%s', (_name, file) => {
    const source = readFileSync(file, 'utf8');
    const tags = pressableTags(source);
    tags.forEach(({ tag }, i) => {
      if (!tag.includes('onPress={() => {}}')) return;
      expect(tag).toContain('accessible={false}');
      const backdrop = tags[i - 1];
      expect(backdrop?.tag ?? '').toContain('accessible={false}');
    });
  });
});

// The Buzón organizer card is a tappable card (open the requester's profile)
// wrapping the Aprobar/Rechazar buttons — no no-op catcher, so the rule above
// cannot see it. On iOS an accessible card swallowed both buttons; making it
// non-accessible must not cost VoiceOver the card's own action, which moves to
// a labelled button on the requester's name.
describe('Buzón organizer request card', () => {
  const source = readFileSync(join(MOBILE, 'app', 'buzon', 'index.tsx'), 'utf8');
  const card = pressableTags(source).find(({ tag }) => tag.includes('key={row.id}'))?.tag ?? '';

  it('does not swallow its Aprobar/Rechazar buttons', () => {
    expect(card).toContain('accessible={false}');
  });

  it('keeps opening the profile reachable as a button of its own', () => {
    const name = pressableTags(source).find(({ tag }) => tag.includes('organizer-requester-'))?.tag ?? '';
    expect(name).toContain('accessibilityRole="button"');
    expect(name).toContain('accessibilityLabel={name}');
    expect(name).toContain('router.push(userHref(row.userId))');
  });
});

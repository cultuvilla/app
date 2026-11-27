/**
 * Turn a CHANGELOG version block into the stores' "What's new" text — the App
 * Store's whatsNew and Google Play's release notes, the same es-ES text.
 *
 * The store notes and the CHANGELOG were drifting because they were written
 * twice. The CHANGELOG is the one that gets reviewed in a PR, so it wins, and
 * the release notes are derived from it — which also means shipping a version
 * whose CHANGELOG section was never stamped fails loudly here rather than
 * quietly publishing an empty "What's New".
 */

import { MAX_PLAY_NOTES } from './play.mjs';

/** Apple caps whatsNew at 4000 characters. */
export const MAX_WHATS_NEW = 4000;
export { MAX_PLAY_NOTES };

const STORE_NOTES = /<!--\s*store-notes\s*-->([\s\S]*?)<!--\s*\/store-notes\s*-->/;

/**
 * Markdown → the plain text both stores render: headings, code, emphasis and
 * links flattened, `- ` bullets as `• `. `**bold**` would otherwise ship with
 * its asterisks visible.
 */
export function flattenNotes(markdown) {
  return String(markdown)
    .replace(/^###\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*-[ \t]+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** The flattened text of a `<!-- store-notes -->` block in `body`, or null. */
export function storeNotesText(body) {
  const m = String(body).match(STORE_NOTES);
  return m ? flattenNotes(m[1]) : null;
}

/**
 * Pull the body of `## vX.Y.Z — date` out of a CHANGELOG, as store text of at
 * most `max` characters (default: Apple's; Play passes its 500).
 *
 * When the section carries a `<!-- store-notes -->…<!-- /store-notes -->` block,
 * only that block is used: the rest of the section is written for the team and
 * a big release flattens into a wall a store cuts off mid-sentence. `release:cut`
 * holds that block to Play's 500, so the cut here is a backstop for a section
 * without one.
 */
export function extractReleaseNotes(changelog, version, { max = MAX_WHATS_NEW } = {}) {
  const lines = String(changelog).split('\n');
  const start = lines.findIndex((l) => new RegExp(`^##\\s+v${version.replace(/\./g, '\\.')}\\b`).test(l));
  if (start === -1) {
    throw new Error(
      `extractReleaseNotes: no "## v${version}" section in the CHANGELOG. ` +
        `Stamp it with \`pnpm release:cut\` before shipping.`,
    );
  }
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^##\s/.test(l));
  const section = (end === -1 ? rest : rest.slice(0, end)).join('\n');
  const text = storeNotesText(section) ?? flattenNotes(section);

  if (!text) throw new Error(`extractReleaseNotes: the "## v${version}" section is empty.`);
  const chars = [...text];
  return chars.length > max ? `${chars.slice(0, max - 1).join('').trimEnd()}…` : text;
}

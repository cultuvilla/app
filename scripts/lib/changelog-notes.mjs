/**
 * Turn a CHANGELOG version block into App Store "What's New" text.
 *
 * The store notes and the CHANGELOG were drifting because they were written
 * twice. The CHANGELOG is the one that gets reviewed in a PR, so it wins, and
 * the release notes are derived from it — which also means shipping a version
 * whose CHANGELOG section was never stamped fails loudly here rather than
 * quietly publishing an empty "What's New".
 */

/** Apple caps whatsNew at 4000 characters. */
export const MAX_WHATS_NEW = 4000;

/**
 * Pull the body of `## vX.Y.Z — date` out of a CHANGELOG.
 *
 * When the section carries a `<!-- store-notes -->…<!-- /store-notes -->` block,
 * only that block is used: the rest of the section is written for the team and
 * a big release flattens into a wall Apple cuts off mid-sentence.
 *
 * Markdown emphasis and links are flattened: the App Store renders plain text,
 * so `**bold**` would otherwise ship with its asterisks visible.
 */
export function extractReleaseNotes(changelog, version) {
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
  const storeNotes = section.match(/<!--\s*store-notes\s*-->([\s\S]*?)<!--\s*\/store-notes\s*-->/);
  const body = storeNotes ? storeNotes[1] : section;

  const text = body
    .replace(/^###\s+/gm, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^[ \t]*-[ \t]+/gm, '• ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!text) throw new Error(`extractReleaseNotes: the "## v${version}" section is empty.`);
  return text.length > MAX_WHATS_NEW ? `${text.slice(0, MAX_WHATS_NEW - 1).trimEnd()}…` : text;
}

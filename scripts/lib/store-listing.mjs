/**
 * The es-ES store listing, read out of docs/store/listing-es-ES.md and held to
 * Google Play's and App Store Connect's limits. No network: the Play push is
 * scripts/push-play-listing.mjs.
 *
 * The doc stays the one place a person edits the listing, so this parses its
 * shape: the shared table's name row, the Play section's two blockquotes, and
 * the App Store table's rows. A field it cannot find is an error, so reshaping
 * the doc fails the check instead of silently checking less.
 *
 * Adapted from ordago-apps' scripts/lib/stores/store-listing.js, which keeps one
 * text file per field instead.
 */

import { readFileSync } from 'node:fs';
import { flattenNotes } from './changelog-notes.mjs';

export const DEFAULT_LISTING_DOC = 'docs/store/listing-es-ES.md';

// Characters, except keywords: Apple documents 100 "characters" without saying
// how it counts an `ñ`, so the stricter reading, bytes, wins — being wrong
// costs a word, not a submission Apple rejects.
export const CHAR_LIMITS = {
  name: 30,
  shortDescription: 80,
  fullDescription: 4000,
  subtitle: 30,
  promotionalText: 170,
  description: 4000,
};
export const KEYWORDS_BYTE_LIMIT = 100;

/** The lines of the `## heading` section, up to the next `## `. */
function section(lines, heading) {
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start === -1) throw new Error(`no "## ${heading}" section`);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => /^## /.test(l));
  return end === -1 ? rest : rest.slice(0, end);
}

/** The first `code` span of the table row whose first cell starts with `label`. */
function tableValue(lines, label, where) {
  const row = lines.find((l) => {
    const cells = l.split('|').map((c) => c.trim());
    return l.trim().startsWith('|') && cells[1]?.startsWith(label);
  });
  if (!row) throw new Error(`no "${label}" row in ${where}`);
  const value = row.split('|').slice(2).join('|').match(/`([^`]*)`/);
  if (!value) throw new Error(`the "${label}" row in ${where} has no \`value\``);
  return value[1];
}

/**
 * The blockquote that follows the line starting with `label`, as store text:
 * hard-wrapped lines join back into one paragraph, bullets keep a line each,
 * and paragraphs are separated by a blank line.
 */
function blockquoteAfter(lines, label, where) {
  const at = lines.findIndex((l) => l.startsWith(label));
  if (at === -1) throw new Error(`no ${label} in ${where}`);
  const quote = [];
  let i = at + 1;
  while (i < lines.length && lines[i].trim() === '') i++;
  for (; i < lines.length && lines[i].startsWith('>'); i++) quote.push(lines[i].replace(/^>\s?/, ''));
  if (quote.length === 0) throw new Error(`no blockquote after ${label} in ${where}`);

  const paragraphs = [];
  let current = [];
  const flush = () => {
    if (current.length) paragraphs.push(current.join('\n'));
    current = [];
  };
  for (const line of quote) {
    if (line.trim() === '') flush();
    else if (/^[•-]\s/.test(line) || current.length === 0) current.push(line.trim());
    else current[current.length - 1] += ` ${line.trim()}`;
  }
  flush();
  return paragraphs.join('\n\n');
}

/**
 * `{ name, shortDescription, fullDescription, subtitle, promotionalText,
 * keywords, description }` — every field as the store would receive it, plain
 * text (neither store renders Markdown, so `**bold**` is flattened). The App
 * Store description is the Play one: the doc says to reuse it.
 */
export function parseStoreListing(markdown) {
  const lines = String(markdown).split('\n');
  const shared = section(lines, 'Shared');
  const play = section(lines, 'Google Play');
  const asc = section(lines, 'App Store');
  const fullDescription = flattenNotes(blockquoteAfter(play, '**Descripción completa**', 'Google Play'));
  return {
    name: tableValue(shared, 'Nombre', 'Shared'),
    shortDescription: flattenNotes(blockquoteAfter(play, '**Descripción corta**', 'Google Play')),
    fullDescription,
    subtitle: tableValue(asc, 'Subtitle', 'App Store'),
    promotionalText: tableValue(asc, 'Promotional text', 'App Store'),
    keywords: tableValue(asc, 'Keywords', 'App Store'),
    description: fullDescription,
  };
}

export function loadStoreListing(file = DEFAULT_LISTING_DOC) {
  return parseStoreListing(readFileSync(file, 'utf8'));
}

const foldWord = (word) => word.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Hard errors — what a store rejects — and warnings: a keyword that repeats a
 * word of the name or subtitle (Apple indexes the three together, so it spends
 * characters and buys nothing) or is listed twice. Wording is a person's call,
 * so a wasted keyword warns instead of failing CI.
 */
function keywordProblems(listing) {
  const errors = [];
  const warnings = [];
  const bytes = Buffer.byteLength(listing.keywords, 'utf8');
  if (bytes > KEYWORDS_BYTE_LIMIT) errors.push(`keywords is ${bytes} bytes; the limit is ${KEYWORDS_BYTE_LIMIT}`);
  const taken = new Set(
    `${listing.name} ${listing.subtitle}`.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(foldWord),
  );
  const seen = new Set();
  for (const keyword of listing.keywords.split(',')) {
    const folded = foldWord(keyword.trim());
    if (keyword === '') errors.push('keywords has an empty keyword (two commas in a row, or a trailing comma)');
    else if (keyword !== keyword.trim()) errors.push(`keywords has a space around «${keyword.trim()}»; Apple counts it`);
    else if (taken.has(folded)) warnings.push(`keyword «${keyword}» is already in the name or subtitle`);
    else if (seen.has(folded)) warnings.push(`keyword «${keyword}» is listed twice`);
    seen.add(folded);
  }
  return { errors, warnings };
}

/** `{ errors, warnings }` — every problem at once, so one run reports them all. */
export function validateStoreListing(listing) {
  const errors = [];
  for (const [field, limit] of Object.entries(CHAR_LIMITS)) {
    const value = listing[field] ?? '';
    if (!value.trim()) errors.push(`${field} is empty`);
    const length = [...value].length;
    if (length > limit) errors.push(`${field} is ${length} characters; the limit is ${limit}`);
  }
  const keywords = keywordProblems(listing);
  return { errors: [...errors, ...keywords.errors], warnings: keywords.warnings };
}

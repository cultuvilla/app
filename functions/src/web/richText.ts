import { entityPath, type UrlEntityKind } from '@cultuvilla/shared/utils';
import { html, raw, type SafeHtml } from './html';
import { arr, num, obj, str } from './read';

/**
 * Renders the app's span-annotated text (news blocks, history bodies): plain
 * `text` plus `mentions`, `links` and formatting `marks`, each an
 * `{offset, length}` window into it. Spans are read best-effort — one that is
 * malformed or out of range is dropped, never thrown on.
 */
export interface RichTextInput {
  text: string;
  mentions?: unknown;
  links?: unknown;
  marks?: unknown;
}

const MENTION_KIND: Readonly<Partial<Record<string, UrlEntityKind>>> = {
  organization: 'organization',
  event: 'event',
  place: 'place',
  barrio: 'barrio',
  festivalPoster: 'festivalPoster',
  news: 'news',
};

const MARK_TAG: Readonly<Partial<Record<string, string>>> = {
  bold: 'strong',
  italic: 'em',
  underline: 'u',
  strikethrough: 's',
};

interface Window {
  start: number;
  end: number;
}

function windows<T>(value: unknown, textLength: number, pick: (span: Record<string, unknown>) => T | null) {
  return arr(value).flatMap((item) => {
    const span = obj(item);
    const offset = num(span?.['offset']);
    const length = num(span?.['length']);
    if (!span || offset === null || length === null || length <= 0 || offset >= textLength) return [];
    const payload = pick(span);
    if (payload === null) return [];
    return [{ start: Math.max(0, offset), end: Math.min(textLength, offset + length), payload }];
  });
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\/\S+$/i.test(url);
}

const TRAILING = new Set(['.', ',', ';', ':', '!', '?', '»', '"', "'", '’', '”', ')']);

function autolink(text: string): SafeHtml {
  const parts: (SafeHtml | string)[] = [];
  let last = 0;
  for (const m of text.matchAll(/https?:\/\/\S+/g)) {
    let url = m[0];
    while (url.length > 0 && TRAILING.has(url[url.length - 1] ?? '')) url = url.slice(0, -1);
    if (!url) continue;
    const at = m.index;
    parts.push(text.slice(last, at), html`<a href="${url}" rel="nofollow ugc">${url}</a>`);
    last = at + url.length;
  }
  parts.push(text.slice(last));
  return html`${parts.map((p) => (typeof p === 'string' ? withBreaks(p) : p))}`;
}

function withBreaks(text: string): SafeHtml {
  return html`${text.split('\n').map((line, i) => (i === 0 ? line : html`<br/>${line}`))}`;
}

export function richText(input: RichTextInput, ctx: { villageSlug: string }): SafeHtml {
  const { text } = input;
  const len = text.length;

  const mentions = windows(input.mentions, len, (s) => {
    const kind = MENTION_KIND[str(s['entityType']) ?? ''];
    const id = str(s['entityId']);
    const label = str(s['label']) ?? '';
    return kind && id ? entityPath(kind, { id, title: label, villageSlug: ctx.villageSlug }) : null;
  });
  const links = windows(input.links, len, (s) => {
    const url = str(s['url']);
    return url && isHttpUrl(url) ? url : null;
  });
  const marks = windows(input.marks, len, (s) => MARK_TAG[str(s['type']) ?? ''] ?? null);
  const anchors: (Window & { href: string; external: boolean })[] = [
    ...mentions.map((m) => ({ ...m, href: m.payload, external: false })),
    ...links.map((l) => ({ ...l, href: l.payload, external: true })),
  ];

  const cuts = new Set<number>([0, len]);
  for (const w of [...anchors, ...marks]) {
    cuts.add(w.start);
    cuts.add(w.end);
  }
  const points = [...cuts].sort((a, b) => a - b);

  // Consecutive segments under the same anchor share one <a>.
  const out: SafeHtml[] = [];
  let open: { href: string; external: boolean; parts: SafeHtml[] } | null = null;
  const flush = () => {
    if (!open) return;
    out.push(
      open.external
        ? html`<a href="${open.href}" rel="nofollow ugc">${open.parts}</a>`
        : html`<a href="${open.href}">${open.parts}</a>`,
    );
    open = null;
  };

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i] ?? 0;
    const end = points[i + 1] ?? 0;
    if (end <= start) continue;
    const segment = text.slice(start, end);
    const anchor = anchors.find((a) => a.start <= start && end <= a.end) ?? null;
    let piece = anchor ? withBreaks(segment) : autolink(segment);
    for (const m of marks) {
      if (m.start <= start && end <= m.end) piece = raw(`<${m.payload}>${piece.value}</${m.payload}>`);
    }
    if (anchor && open?.href === anchor.href) {
      open.parts.push(piece);
      continue;
    }
    flush();
    if (anchor) open = { href: anchor.href, external: anchor.external, parts: [piece] };
    else out.push(piece);
  }
  flush();
  return html`${out}`;
}

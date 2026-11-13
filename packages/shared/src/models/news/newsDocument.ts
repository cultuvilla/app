import type {
  MentionEntityType,
  NewsBlock,
  NewsImageBlock,
  NewsLink,
  NewsMark,
  NewsMarkType,
  NewsMention,
  NewsTextBlock,
} from './NewsPostDataModel';
import type { NewsHeadingStyle } from './newsEditorBlocks';

// ── The studio editor's document ────────────────────────────────────────────
// The web studio edits articles in a ProseMirror (Tiptap) editor, whose content
// is this JSON tree. The app edits the same article as `NewsBlock[]`, so every
// article must survive a trip through either editor: these converters are the
// one place the two shapes meet, and they are round-trip tested.
//
// Mapping:
//   - consecutive paragraphs ⇄ ONE stored text block, joined by a blank line
//     ("\n\n"), which is how the app's single text area writes prose; a line
//     break inside a paragraph ⇄ "\n";
//   - heading level 2 / 3 ⇄ a text block styled `section` / `subsection`;
//   - newsImage (its content is the caption) ⇄ an image block;
//   - mention node ⇄ a mention span; link mark ⇄ a link span; bold, italic,
//     underline, strike marks ⇄ format mark spans.

export const NEWS_DOC_FORMAT_MARKS = ['bold', 'italic', 'underline', 'strike'] as const;
export type NewsDocFormatMarkType = (typeof NEWS_DOC_FORMAT_MARKS)[number];

export type NewsDocMark =
  | { type: NewsDocFormatMarkType }
  | { type: 'link'; attrs: { href: string } };

export interface NewsDocText {
  type: 'text';
  text: string;
  marks?: NewsDocMark[];
}

export interface NewsDocMention {
  type: 'mention';
  attrs: {
    id: string;
    entityType: MentionEntityType;
    /** The entity's name when it was mentioned (the stored `label` snapshot). */
    label: string;
    /** The characters the mention shows in the prose. */
    text: string;
  };
  marks?: NewsDocMark[];
}

export interface NewsDocHardBreak {
  type: 'hardBreak';
  marks?: NewsDocMark[];
}

export type NewsDocInline = NewsDocText | NewsDocMention | NewsDocHardBreak;

export interface NewsDocParagraph {
  type: 'paragraph';
  content?: NewsDocInline[];
}

export const NEWS_DOC_HEADING_LEVEL: Record<NewsHeadingStyle, 2 | 3> = { section: 2, subsection: 3 };

export interface NewsDocHeading {
  type: 'heading';
  attrs: { level: 2 | 3 };
  content?: NewsDocInline[];
}

export interface NewsDocImage {
  type: 'newsImage';
  attrs: {
    /** Null while the image is picked but not uploaded yet. */
    storagePath: string | null;
    width: number;
    height: number;
  };
  /** The caption. */
  content?: NewsDocInline[];
}

export type NewsDocBlock = NewsDocParagraph | NewsDocHeading | NewsDocImage;

export interface NewsDoc {
  type: 'doc';
  content: NewsDocBlock[];
}

const PARAGRAPH_BREAK = '\n\n';

const DOC_TO_STORED_MARK: Record<NewsDocFormatMarkType, NewsMarkType> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strikethrough',
};
const STORED_TO_DOC_MARK: Record<NewsMarkType, NewsDocFormatMarkType> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strikethrough: 'strike',
};

/** Text with its spans, as a stored text block (or an image caption) holds it. */
interface RichText {
  text: string;
  mentions: NewsMention[];
  links: NewsLink[];
  marks: NewsMark[];
}

// ── Document → blocks ───────────────────────────────────────────────────────

function sortSpans<T extends { offset: number }>(spans: T[]): T[] {
  return [...spans].sort((a, b) => a.offset - b.offset);
}

/** Sorted, merged and non-overlapping, per type — the shape the app normalizes marks to. */
function normalizeMarks(marks: NewsMark[]): NewsMark[] {
  const out: NewsMark[] = [];
  for (const type of ['bold', 'italic', 'underline', 'strikethrough'] as const) {
    let open: NewsMark | null = null;
    for (const m of sortSpans(marks.filter((s) => s.type === type))) {
      if (open && m.offset <= open.offset + open.length) {
        open.length = Math.max(open.length, m.offset + m.length - open.offset);
      } else {
        open = { type, offset: m.offset, length: m.length };
        out.push(open);
      }
    }
  }
  return sortSpans(out);
}

/** ProseMirror splits a link's text at every mark change; one link is one span. */
function mergeLinks(links: NewsLink[]): NewsLink[] {
  const out: NewsLink[] = [];
  for (const l of sortSpans(links)) {
    const prev = out.at(-1);
    if (prev && prev.url === l.url && prev.offset + prev.length === l.offset) {
      prev.length += l.length;
    } else {
      out.push({ ...l });
    }
  }
  return out;
}

function inlineToRichText(inline: readonly NewsDocInline[] = []): RichText {
  let text = '';
  const mentions: NewsMention[] = [];
  const links: NewsLink[] = [];
  const marks: NewsMark[] = [];

  const applyMarks = (docMarks: NewsDocMark[] | undefined, offset: number, length: number) => {
    for (const mark of docMarks ?? []) {
      if (mark.type === 'link') links.push({ url: mark.attrs.href, offset, length });
      else marks.push({ type: DOC_TO_STORED_MARK[mark.type], offset, length });
    }
  };

  for (const node of inline) {
    const offset = text.length;
    if (node.type === 'text') {
      text += node.text;
      applyMarks(node.marks, offset, node.text.length);
    } else if (node.type === 'mention') {
      const { id, entityType, label, text: shown } = node.attrs;
      text += shown;
      mentions.push({ entityType, entityId: id, label, offset, length: shown.length });
      applyMarks(node.marks, offset, shown.length);
    } else {
      text += '\n';
    }
  }

  return {
    text,
    mentions,
    // A link stored only for custom text: a bare URL is autolinked at render.
    links: mergeLinks(links).filter((l) => text.slice(l.offset, l.offset + l.length) !== l.url),
    marks: normalizeMarks(marks),
  };
}

function shiftSpans<T extends { offset: number }>(spans: T[], by: number): T[] {
  return spans.map((s) => ({ ...s, offset: s.offset + by }));
}

function joinRichText(parts: RichText[], separator: string): RichText {
  const joined: RichText = { text: '', mentions: [], links: [], marks: [] };
  parts.forEach((part, i) => {
    if (i > 0) joined.text += separator;
    const at = joined.text.length;
    joined.text += part.text;
    joined.mentions.push(...shiftSpans(part.mentions, at));
    joined.links.push(...shiftSpans(part.links, at));
    joined.marks.push(...shiftSpans(part.marks, at));
  });
  return { ...joined, marks: normalizeMarks(joined.marks) };
}

function plainText(inline: readonly NewsDocInline[] = []): string {
  return inline
    .map((node) => (node.type === 'text' ? node.text : node.type === 'mention' ? node.attrs.text : ' '))
    .join('');
}

/**
 * The studio document as the stored `content`. Empty paragraphs and headings
 * are dropped, as the app drops them on save. Every image must be uploaded
 * first: one still without a `storagePath` throws.
 */
export function newsDocToBlocks(doc: NewsDoc): NewsBlock[] {
  const blocks: NewsBlock[] = [];
  let paragraphs: RichText[] = [];

  const flushParagraphs = () => {
    if (paragraphs.length === 0) return;
    const prose = joinRichText(paragraphs, PARAGRAPH_BREAK);
    paragraphs = [];
    if (prose.text.trim().length === 0) return;
    blocks.push({ type: 'text', ...prose, style: 'paragraph' });
  };

  for (const node of doc.content) {
    if (node.type === 'paragraph') {
      paragraphs.push(inlineToRichText(node.content));
      continue;
    }
    flushParagraphs();
    if (node.type === 'heading') {
      const text = plainText(node.content).trim();
      if (text.length === 0) continue;
      const style: NewsHeadingStyle = node.attrs.level === 2 ? 'section' : 'subsection';
      blocks.push({ type: 'text', text, mentions: [], links: [], marks: [], style });
      continue;
    }
    const { storagePath, width, height } = node.attrs;
    if (!storagePath) throw new Error('newsDocToBlocks: upload every image before converting the document');
    const caption = inlineToRichText(node.content);
    const hasCaption = caption.text.trim().length > 0;
    const image: NewsImageBlock = {
      type: 'image',
      storagePath,
      width,
      height,
      caption: hasCaption ? caption.text : null,
      captionMentions: hasCaption ? caption.mentions : [],
      captionLinks: hasCaption ? caption.links : [],
      captionMarks: hasCaption ? caption.marks : [],
    };
    blocks.push(image);
  }
  flushParagraphs();
  return blocks;
}

// ── Blocks → document ───────────────────────────────────────────────────────

/** The spans of `rich` that fall inside [start, end), rebased to `start`. */
function sliceRichText(rich: RichText, start: number, end: number): RichText {
  const clip = <T extends { offset: number; length: number }>(spans: T[]): T[] =>
    spans.flatMap((s) => {
      const from = Math.max(s.offset, start);
      const to = Math.min(s.offset + s.length, end);
      return to > from ? [{ ...s, offset: from - start, length: to - from }] : [];
    });
  return {
    text: rich.text.slice(start, end),
    // A mention is atomic: one cut by the range is dropped, never halved.
    mentions: rich.mentions
      .filter((m) => m.offset >= start && m.offset + m.length <= end)
      .map((m) => ({ ...m, offset: m.offset - start })),
    links: clip(rich.links),
    marks: clip(rich.marks),
  };
}

function docMarksAt(rich: RichText, at: number): NewsDocMark[] {
  const covers = (s: { offset: number; length: number }) => s.offset <= at && at < s.offset + s.length;
  const format = NEWS_DOC_FORMAT_MARKS.filter((type) =>
    rich.marks.some((m) => STORED_TO_DOC_MARK[m.type] === type && covers(m)),
  ).map((type): NewsDocMark => ({ type }));
  const link = rich.links.find(covers);
  return link ? [...format, { type: 'link', attrs: { href: link.url } }] : format;
}

function withMarks<T extends NewsDocInline>(node: T, marks: NewsDocMark[]): T {
  return marks.length > 0 ? { ...node, marks } : node;
}

function richTextToInline(rich: RichText): NewsDocInline[] {
  const mentions = sortSpans(rich.mentions).filter((m) => m.length > 0);
  const cuts = new Set<number>([0, rich.text.length]);
  for (const s of [...mentions, ...rich.links, ...rich.marks]) {
    cuts.add(s.offset);
    cuts.add(s.offset + s.length);
  }
  for (let i = 0; i < rich.text.length; i++) {
    if (rich.text[i] === '\n') {
      cuts.add(i);
      cuts.add(i + 1);
    }
  }
  const bounds = [...cuts].filter((c) => c >= 0 && c <= rich.text.length).sort((a, b) => a - b);

  const segments: { start: number; end: number }[] = [];
  bounds.reduce((start, end) => {
    segments.push({ start, end });
    return end;
  });
  const inline: NewsDocInline[] = [];
  let skipUntil = 0;
  for (const { start, end } of segments) {
    if (start < skipUntil) continue;
    const mention = mentions.find((m) => m.offset === start);
    if (mention) {
      inline.push(
        withMarks(
          {
            type: 'mention',
            attrs: {
              id: mention.entityId,
              entityType: mention.entityType,
              label: mention.label,
              text: rich.text.slice(mention.offset, mention.offset + mention.length),
            },
          },
          docMarksAt(rich, start),
        ),
      );
      skipUntil = mention.offset + mention.length;
      continue;
    }
    const text = rich.text.slice(start, end);
    if (text === '\n') inline.push({ type: 'hardBreak' });
    else inline.push(withMarks({ type: 'text', text }, docMarksAt(rich, start)));
  }
  return inline;
}

function paragraphsOf(block: NewsTextBlock): NewsDocParagraph[] {
  const paragraphs: NewsDocParagraph[] = [];
  let start = 0;
  for (;;) {
    const brk = block.text.indexOf(PARAGRAPH_BREAK, start);
    const end = brk === -1 ? block.text.length : brk;
    const inline = richTextToInline(sliceRichText(block, start, end));
    paragraphs.push(inline.length > 0 ? { type: 'paragraph', content: inline } : { type: 'paragraph' });
    if (brk === -1) return paragraphs;
    start = brk + PARAGRAPH_BREAK.length;
  }
}

/** The stored `content` as a studio document. */
export function newsBlocksToDoc(blocks: readonly NewsBlock[]): NewsDoc {
  const content: NewsDocBlock[] = [];
  for (const block of blocks) {
    if (block.type === 'image') {
      const caption = block.caption
        ? richTextToInline({
            text: block.caption,
            mentions: block.captionMentions,
            links: block.captionLinks,
            marks: block.captionMarks,
          })
        : [];
      const { storagePath, width, height } = block;
      content.push(
        caption.length > 0
          ? { type: 'newsImage', attrs: { storagePath, width, height }, content: caption }
          : { type: 'newsImage', attrs: { storagePath, width, height } },
      );
    } else if (block.style === 'paragraph') {
      content.push(...paragraphsOf(block));
    } else {
      const heading: NewsDocHeading = { type: 'heading', attrs: { level: NEWS_DOC_HEADING_LEVEL[block.style] } };
      content.push(block.text ? { ...heading, content: [{ type: 'text', text: block.text }] } : heading);
    }
  }
  return { type: 'doc', content: content.length > 0 ? content : [{ type: 'paragraph' }] };
}

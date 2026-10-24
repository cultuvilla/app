import type {
  NewsBlock,
  NewsLink,
  NewsMark,
  NewsMention,
  NewsTextBlock,
  NewsTextStyle,
} from './NewsPostDataModel';

export type NewsHeadingStyle = Exclude<NewsTextStyle, 'paragraph'>;

/**
 * The app editor's text block. Distinct from the persisted `NewsTextBlock`: it
 * carries a stable `id` for list keys, and a heading is its own block type
 * rather than a styled text block.
 */
export type EditorTextBlock = {
  id: string;
  type: 'text';
  text: string;
  mentions: NewsMention[];
  links: NewsLink[];
  marks: NewsMark[];
};

/** A section / subsection title: plain text, no mentions, links or marks. */
export type EditorHeadingBlock = {
  id: string;
  type: 'heading';
  text: string;
  level: NewsHeadingStyle;
};

let blockSeq = 0;
export function newBlockId(): string {
  blockSeq += 1;
  return `b${String(blockSeq)}-${String(Date.now())}`;
}

/** Stored text block → editor block. A heading is persisted as a styled text block. */
export function newsTextToEditorBlock(b: NewsTextBlock): EditorTextBlock | EditorHeadingBlock {
  if (b.style !== 'paragraph') return { id: newBlockId(), type: 'heading', text: b.text, level: b.style };
  return { id: newBlockId(), type: 'text', text: b.text, mentions: b.mentions, links: b.links, marks: b.marks };
}

/** Editor text or heading block → stored text block. */
export function editorBlockToNewsText(b: EditorTextBlock | EditorHeadingBlock): NewsTextBlock {
  if (b.type === 'heading') {
    return { type: 'text', text: b.text, mentions: [], links: [], marks: [], style: b.level };
  }
  return { type: 'text', text: b.text, mentions: b.mentions, links: b.links, marks: b.marks, style: 'paragraph' };
}

/** The legacy plain-text `body` mirror of a post's text blocks (search, previews). */
export function flattenNewsBody(content: readonly NewsBlock[]): string {
  return content
    .filter((b): b is NewsTextBlock => b.type === 'text')
    .map((b) => b.text.trim())
    .filter(Boolean)
    .join('\n\n');
}

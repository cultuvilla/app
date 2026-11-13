import { getSchema } from '@tiptap/core';
import { describe, expect, it } from 'vitest';
import type { NewsBlock, NewsTextBlock } from '@cultuvilla/shared/models/news/NewsPostDataModel';
import { newsBlocksToDoc, newsDocToBlocks, type NewsDoc } from '@cultuvilla/shared/models/news/newsDocument';
import { newsEditorExtensions } from './extensions';

const schema = getSchema(newsEditorExtensions(() => []));

function span(text: string, part: string) {
  return { offset: text.indexOf(part), length: part.length };
}

const PROSE = 'Con la Peña El Pilón\ny su charanga.\n\nMás en la web.';
const CAPTION = 'La plaza y la Ermita';

const ARTICLE: NewsBlock[] = [
  {
    type: 'text',
    text: PROSE,
    style: 'paragraph',
    mentions: [{ entityType: 'organization', entityId: 'o1', label: 'Peña El Pilón', ...span(PROSE, 'Peña El Pilón') }],
    links: [{ url: 'https://example.org', ...span(PROSE, 'la web') }],
    marks: [
      { type: 'bold', ...span(PROSE, 'Con la Peña El Pilón') },
      { type: 'strikethrough', ...span(PROSE, 'charanga') },
    ] as NewsTextBlock['marks'],
  },
  { type: 'text', text: 'Programa', style: 'section', mentions: [], links: [], marks: [] },
  { type: 'text', text: 'Sábado', style: 'subsection', mentions: [], links: [], marks: [] },
  {
    type: 'image',
    storagePath: 'news/p/images/a.jpg',
    width: 800,
    height: 600,
    caption: CAPTION,
    captionMentions: [{ entityType: 'place', entityId: 'pl1', label: 'Ermita', ...span(CAPTION, 'Ermita') }],
    captionLinks: [],
    captionMarks: [{ type: 'italic', ...span(CAPTION, 'plaza') }],
  },
];

describe('the studio editor schema', () => {
  it('accepts every article shape the app writes, and gives it back unchanged', () => {
    const node = schema.nodeFromJSON(newsBlocksToDoc(ARTICLE));
    expect(() => node.check()).not.toThrow();
    expect(newsDocToBlocks(node.toJSON() as NewsDoc)).toEqual(ARTICLE);
  });

  it('keeps titles plain text', () => {
    expect(schema.nodes.heading?.spec.marks).toBe('');
  });

  it('has nothing the stored article cannot hold', () => {
    for (const name of ['bulletList', 'orderedList', 'blockquote', 'codeBlock', 'horizontalRule']) {
      expect(schema.nodes[name], name).toBeUndefined();
    }
    expect(schema.marks.code).toBeUndefined();
  });
});

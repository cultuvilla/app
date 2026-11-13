import { describe, it, expect } from 'vitest';
import {
  NewsBlockSchema,
  type NewsBlock,
  type NewsTextBlock,
} from '../../../src/models/news/NewsPostDataModel';
import { newsBlocksToDoc, newsDocToBlocks, type NewsDoc } from '../../../src/models/news/newsDocument';
import { flattenNewsBody } from '../../../src/models/news/newsEditorBlocks';

function paragraph(text: string, spans: Partial<Omit<NewsTextBlock, 'type' | 'text'>> = {}): NewsTextBlock {
  return { type: 'text', text, mentions: [], links: [], marks: [], style: 'paragraph', ...spans };
}

/** Where `part` sits in `text`, as a span. */
function at(text: string, part: string): { offset: number; length: number } {
  const offset = text.indexOf(part);
  if (offset < 0) throw new Error(`"${part}" is not in "${text}"`);
  return { offset, length: part.length };
}

const PROSE = 'Las fiestas de la Peña El Pilón\nempiezan el viernes.\n\nMás en la web del pueblo.';
const CAPTION = 'La plaza con la Peña Viejos';

/** An article as the app writes it: every span kind, headings, images with rich captions. */
const APP_ARTICLE: NewsBlock[] = [
  paragraph(PROSE, {
    mentions: [{ entityType: 'organization', entityId: 'org1', label: 'Peña El Pilón', ...at(PROSE, 'Peña El Pilón') }],
    links: [{ url: 'https://matabuena.es', ...at(PROSE, 'la web') }],
    marks: [
      { type: 'bold', ...at(PROSE, 'Las fiestas') },
      { type: 'italic', ...at(PROSE, 'fiestas de la Peña El Pilón') },
      { type: 'strikethrough', ...at(PROSE, 'viernes') },
      { type: 'underline', ...at(PROSE, 'web del') },
    ].sort((a, b) => a.offset - b.offset) as NewsTextBlock['marks'],
  }),
  { type: 'text', text: 'Programa', mentions: [], links: [], marks: [], style: 'section' },
  paragraph('Misa y procesión.'),
  { type: 'text', text: 'Sábado', mentions: [], links: [], marks: [], style: 'subsection' },
  {
    type: 'image',
    storagePath: 'news/p1/images/a.jpg',
    width: 1200,
    height: 800,
    caption: CAPTION,
    captionMentions: [{ entityType: 'organization', entityId: 'org2', label: 'Peña Viejos', ...at(CAPTION, 'Peña Viejos') }],
    captionLinks: [],
    captionMarks: [{ type: 'bold', ...at(CAPTION, 'plaza') }],
  },
  {
    type: 'image',
    storagePath: 'news/p1/images/b.jpg',
    width: 600,
    height: 900,
    caption: null,
    captionMentions: [],
    captionLinks: [],
    captionMarks: [],
  },
  paragraph('Fin.'),
];

describe('news document ⇄ blocks', () => {
  it('round-trips an app-written article unchanged', () => {
    expect(newsDocToBlocks(newsBlocksToDoc(APP_ARTICLE))).toEqual(APP_ARTICLE);
  });

  it('round-trips a studio document unchanged', () => {
    const doc = newsBlocksToDoc(APP_ARTICLE);
    expect(newsBlocksToDoc(newsDocToBlocks(doc))).toEqual(doc);
  });

  it('writes blocks the stored schema accepts', () => {
    for (const block of newsDocToBlocks(newsBlocksToDoc(APP_ARTICLE))) {
      expect(() => NewsBlockSchema.parse(block)).not.toThrow();
    }
  });

  it('keeps the legacy body mirror identical', () => {
    expect(flattenNewsBody(newsDocToBlocks(newsBlocksToDoc(APP_ARTICLE)))).toBe(flattenNewsBody(APP_ARTICLE));
  });

  it('splits a text block into paragraphs at blank lines and lines at single newlines', () => {
    const doc = newsBlocksToDoc([paragraph('uno\ndos\n\ntres')]);
    expect(doc.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'uno' }, { type: 'hardBreak' }, { type: 'text', text: 'dos' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'tres' }] },
    ]);
  });

  it('writes consecutive studio paragraphs as one text block, as the app does', () => {
    const doc: NewsDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'uno' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'dos', marks: [{ type: 'bold' }] }] },
      ],
    };
    expect(newsDocToBlocks(doc)).toEqual([
      paragraph('uno\n\ndos', { marks: [{ type: 'bold', offset: 5, length: 3 }] }),
    ]);
  });

  it('turns a mention node into a span with its label snapshot', () => {
    const doc: NewsDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'Con ' },
            { type: 'mention', attrs: { id: 'p1', entityType: 'place', label: 'Ermita', text: 'la Ermita' } },
          ],
        },
      ],
    };
    expect(newsDocToBlocks(doc)).toEqual([
      paragraph('Con la Ermita', {
        mentions: [{ entityType: 'place', entityId: 'p1', label: 'Ermita', offset: 4, length: 9 }],
      }),
    ]);
  });

  it('merges a link ProseMirror split at a mark change into one span', () => {
    const href = 'https://example.org';
    const doc: NewsDoc = {
      type: 'doc',
      content: [
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: 'la ', marks: [{ type: 'link', attrs: { href } }] },
            { type: 'text', text: 'web', marks: [{ type: 'bold' }, { type: 'link', attrs: { href } }] },
          ],
        },
      ],
    };
    expect(newsDocToBlocks(doc)[0]).toMatchObject({ links: [{ url: href, offset: 0, length: 6 }] });
  });

  it('never stores a bare URL as a link (the reader autolinks those)', () => {
    const href = 'https://example.org';
    const doc: NewsDoc = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] }] }],
    };
    expect(newsDocToBlocks(doc)).toEqual([paragraph(href)]);
  });

  it('drops empty paragraphs, headings and captions, as the app does on save', () => {
    const doc: NewsDoc = {
      type: 'doc',
      content: [
        { type: 'paragraph' },
        { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '  ' }] },
        { type: 'newsImage', attrs: { storagePath: 'x.jpg', width: 1, height: 1 }, content: [{ type: 'text', text: ' ' }] },
        { type: 'paragraph', content: [{ type: 'text', text: ' ' }] },
      ],
    };
    expect(newsDocToBlocks(doc)).toEqual([
      { type: 'image', storagePath: 'x.jpg', width: 1, height: 1, caption: null, captionMentions: [], captionLinks: [], captionMarks: [] },
    ]);
  });

  it('refuses an image that is not uploaded yet', () => {
    const doc: NewsDoc = { type: 'doc', content: [{ type: 'newsImage', attrs: { storagePath: null, width: 1, height: 1 } }] };
    expect(() => newsDocToBlocks(doc)).toThrow(/upload/);
  });

  it('gives an empty article one empty paragraph to type in', () => {
    expect(newsBlocksToDoc([])).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(newsDocToBlocks(newsBlocksToDoc([]))).toEqual([]);
  });

  it('clips a mark that spans a blank line into one span per paragraph', () => {
    const block = paragraph('ab\n\ncd', { marks: [{ type: 'bold', offset: 0, length: 6 }] });
    expect(newsDocToBlocks(newsBlocksToDoc([block]))).toEqual([
      paragraph('ab\n\ncd', {
        marks: [
          { type: 'bold', offset: 0, length: 2 },
          { type: 'bold', offset: 4, length: 2 },
        ],
      }),
    ]);
  });
});

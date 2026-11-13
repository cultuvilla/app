import { render, fireEvent } from '@testing-library/react-native';
import { BlockEditor, type EditorBlock, type EditorImageBlock } from '../BlockEditor';
import {
  editorBlockToNewsText,
  newsTextToEditorBlock,
  type EditorHeadingBlock,
  type EditorTextBlock,
} from '@cultuvilla/shared/models/news/newsEditorBlocks';

jest.mock('../../../lib/i18n', () => ({ useT: () => ({ locale: 'es', t: (k: string) => k }) }));

function imageBlock(id: string): EditorImageBlock {
  return {
    id,
    type: 'image',
    storagePath: `p/${id}`,
    blob: null,
    uri: null,
    width: 10,
    height: 10,
    caption: '',
    captionMentions: [],
    captionLinks: [],
    captionMarks: [],
  };
}

describe('BlockEditor', () => {
  it('merges links across a removed image, rebasing the trailing block offsets', () => {
    const blocks: EditorBlock[] = [
      {
        id: 't1',
        type: 'text',
        text: 'antes',
        mentions: [],
        links: [{ url: 'https://a.com', offset: 0, length: 5 }],
        marks: [{ type: 'bold', offset: 0, length: 5 }],
      },
      {
        id: 'i1',
        type: 'image',
        storagePath: 'p/1',
        blob: null,
        uri: null,
        width: 10,
        height: 10,
        caption: '',
        captionMentions: [],
        captionLinks: [],
        captionMarks: [],
      },
      {
        id: 't2',
        type: 'text',
        text: 'después',
        mentions: [],
        links: [{ url: 'https://b.com', offset: 0, length: 7 }],
        marks: [{ type: 'italic', offset: 0, length: 7 }],
      },
    ];
    const onChange = jest.fn();
    const { getByLabelText } = render(<BlockEditor blocks={blocks} onChange={onChange} candidates={[]} />);
    fireEvent.press(getByLabelText('news.compose.block.removeImage'));
    const merged = onChange.mock.calls.at(-1)![0][0];
    expect(merged.text).toBe('antes\n\ndespués');
    expect(merged.links).toEqual([
      { url: 'https://a.com', offset: 0, length: 5 },
      { url: 'https://b.com', offset: 7, length: 7 }, // shifted by "antes\n\n"
    ]);
    expect(merged.marks).toEqual([
      { type: 'bold', offset: 0, length: 5 },
      { type: 'italic', offset: 7, length: 7 }, // shifted by "antes\n\n"
    ]);
  });

  it('hides the "add image" affordance once 25 image blocks are present', () => {
    const blocks: EditorBlock[] = Array.from({ length: 25 }, (_, i) => imageBlock(`i${i}`));
    const { queryByLabelText } = render(<BlockEditor blocks={blocks} onChange={jest.fn()} candidates={[]} />);
    expect(queryByLabelText('news.compose.block.addImage')).toBeNull();
  });

  it('still shows the "add image" affordance under the cap', () => {
    const blocks: EditorBlock[] = Array.from({ length: 24 }, (_, i) => imageBlock(`i${i}`));
    const { queryByLabelText } = render(<BlockEditor blocks={blocks} onChange={jest.fn()} candidates={[]} />);
    expect(queryByLabelText('news.compose.block.addImage')).not.toBeNull();
  });
});

describe('BlockEditor sections', () => {
  const para = (id: string, text: string): EditorTextBlock => ({ id, type: 'text', text, mentions: [], links: [], marks: [] });

  it('turns the line holding the selection into a title from the format toolbar', () => {
    const onChange = jest.fn();
    const text = 'intro\nPrograma de fiestas\nmisa a las 12';
    const { getAllByPlaceholderText, getByLabelText } = render(
      <BlockEditor blocks={[
        { ...para('t1', text), marks: [{ type: 'bold', offset: 0, length: 5 }, { type: 'italic', offset: 31, length: 5 }] },
      ]} onChange={onChange} candidates={[]} />,
    );
    const input = getAllByPlaceholderText('news.compose.block.textPlaceholder')[0]!;
    // Select "fiestas" — part of the middle line.
    fireEvent(input, 'selectionChange', { nativeEvent: { selection: { start: 12, end: 19 } } });
    fireEvent.press(getByLabelText('news.compose.format.section'));

    const next: EditorBlock[] = onChange.mock.calls.at(-1)![0];
    expect(next.map((b) => b.type)).toEqual(['text', 'heading', 'text']);
    expect(next[0]).toMatchObject({ id: 't1', text: 'intro', marks: [{ type: 'bold', offset: 0, length: 5 }] });
    expect(next[1]).toMatchObject({ type: 'heading', text: 'Programa de fiestas', level: 'section' });
    // "a las" italic at 31 in the original → 5 in the trailing paragraph.
    expect(next[2]).toMatchObject({ text: 'misa a las 12', marks: [{ type: 'italic', offset: 5, length: 5 }] });
  });

  it('keeps a text box after a title made from the last line', () => {
    const onChange = jest.fn();
    const { getAllByPlaceholderText, getByLabelText } = render(
      <BlockEditor blocks={[para('t1', 'Programa')]} onChange={onChange} candidates={[]} />,
    );
    const input = getAllByPlaceholderText('news.compose.block.textPlaceholder')[0]!;
    fireEvent(input, 'selectionChange', { nativeEvent: { selection: { start: 0, end: 3 } } });
    fireEvent.press(getByLabelText('news.compose.format.subsection'));

    const next: EditorBlock[] = onChange.mock.calls.at(-1)![0];
    expect(next.map((b) => b.type)).toEqual(['heading', 'text']);
    expect(next[0]).toMatchObject({ text: 'Programa', level: 'subsection' });
    expect(next[1]).toMatchObject({ text: '' });
  });

  it('offers no title buttons on image captions', () => {
    const { getByPlaceholderText, queryByLabelText } = render(
      <BlockEditor blocks={[{ ...imageBlock('i1'), caption: 'Foto' }]} onChange={jest.fn()} candidates={[]} />,
    );
    fireEvent(getByPlaceholderText('news.compose.block.captionPlaceholder'), 'selectionChange', {
      nativeEvent: { selection: { start: 0, end: 4 } },
    });
    expect(queryByLabelText('news.compose.format.bold')).not.toBeNull();
    expect(queryByLabelText('news.compose.format.section')).toBeNull();
  });

  it('turns a title back into a line of the surrounding paragraphs', () => {
    const onChange = jest.fn();
    const blocks: EditorBlock[] = [
      para('t1', 'intro'),
      { id: 'h1', type: 'heading', text: 'Programa', level: 'section' },
      { ...para('t2', 'misa'), marks: [{ type: 'bold', offset: 0, length: 4 }] },
    ];
    const { getByLabelText } = render(<BlockEditor blocks={blocks} onChange={onChange} candidates={[]} />);
    fireEvent.press(getByLabelText('news.compose.block.paragraph'));

    const next: EditorBlock[] = onChange.mock.calls.at(-1)![0];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({
      id: 't1',
      type: 'text',
      text: 'intro\nPrograma\nmisa',
      marks: [{ type: 'bold', offset: 15, length: 4 }],
    });
  });

  it('no longer shows a separate add-section button', () => {
    const { queryByLabelText } = render(<BlockEditor blocks={[para('t1', '')]} onChange={jest.fn()} candidates={[]} />);
    expect(queryByLabelText('news.compose.block.addSection')).toBeNull();
    expect(queryByLabelText('news.compose.block.addImage')).not.toBeNull();
  });

  it('switches a heading between section and subsection', () => {
    const onChange = jest.fn();
    const heading: EditorHeadingBlock = { id: 'h1', type: 'heading', text: 'Programa', level: 'section' };
    const { getByLabelText } = render(<BlockEditor blocks={[heading]} onChange={onChange} candidates={[]} />);
    fireEvent.press(getByLabelText('news.compose.block.subsection'));
    expect(onChange.mock.calls.at(-1)![0][0]).toMatchObject({ id: 'h1', level: 'subsection' });
  });

  it('edits the heading text', () => {
    const onChange = jest.fn();
    const heading: EditorHeadingBlock = { id: 'h1', type: 'heading', text: '', level: 'section' };
    const { getByPlaceholderText } = render(<BlockEditor blocks={[heading]} onChange={onChange} candidates={[]} />);
    fireEvent.changeText(getByPlaceholderText('news.compose.block.sectionPlaceholder'), 'Programa');
    expect(onChange.mock.calls.at(-1)![0][0]).toMatchObject({ text: 'Programa' });
  });

  it('merges the paragraphs back together when the heading between them is removed', () => {
    const onChange = jest.fn();
    const blocks: EditorBlock[] = [
      para('t1', 'antes'),
      { id: 'h1', type: 'heading', text: 'Programa', level: 'section' },
      para('t2', 'después'),
    ];
    const { getByLabelText } = render(<BlockEditor blocks={blocks} onChange={onChange} candidates={[]} />);
    fireEvent.press(getByLabelText('news.compose.block.removeSection'));
    const next: EditorBlock[] = onChange.mock.calls.at(-1)![0];
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ id: 't1', text: 'antes\n\ndespués' });
  });
});

describe('news block mapping', () => {
  it('round-trips a heading through the stored text-block style', () => {
    const heading: EditorHeadingBlock = { id: 'h1', type: 'heading', text: 'Programa', level: 'subsection' };
    const stored = editorBlockToNewsText(heading);
    expect(stored).toEqual({ type: 'text', text: 'Programa', mentions: [], links: [], marks: [], style: 'subsection' });
    expect(newsTextToEditorBlock(stored)).toMatchObject({ type: 'heading', text: 'Programa', level: 'subsection' });
  });

  it('keeps a paragraph a formatted text block', () => {
    const stored = {
      type: 'text' as const, text: 'hola', mentions: [], links: [],
      marks: [{ type: 'bold' as const, offset: 0, length: 4 }], style: 'paragraph' as const,
    };
    const editor = newsTextToEditorBlock(stored);
    expect(editor).toMatchObject({ type: 'text', text: 'hola', marks: stored.marks });
    expect(editorBlockToNewsText(editor)).toEqual(stored);
  });
});

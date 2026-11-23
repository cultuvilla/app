import { useEffect, useRef, type ChangeEvent } from 'react';
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react';
import type { NewsDoc } from '@cultuvilla/shared/models/news/newsDocument';
import type { MentionCandidate } from '@cultuvilla/shared/services/mentionCandidateService';
import { t } from '../i18n';
import { newsEditorExtensions } from './extensions';
import { holdPendingImage, prepareImage } from './images';

// The app caps an article's inline images at the same number (BlockEditor).
const MAX_IMAGES = 25;
const LINK_PATTERN = /^https?:\/\/\S+$/i;

interface NewsEditorProps {
  initialDoc: NewsDoc;
  candidates: MentionCandidate[];
  onReady: (editor: Editor) => void;
  onChange: () => void;
  onImageError: () => void;
}

function imageCount(editor: Editor): number {
  let count = 0;
  editor.state.doc.descendants((node) => {
    if (node.type.name === 'newsImage') count += 1;
  });
  return count;
}

export function NewsEditor({ initialDoc, candidates, onReady, onChange, onImageError }: NewsEditorProps) {
  const candidatesRef = useRef(candidates);
  candidatesRef.current = candidates;
  const fileInput = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: newsEditorExtensions(() => candidatesRef.current),
    content: initialDoc,
    onUpdate: () => onChange(),
    editorProps: { attributes: { class: 'news-body', 'aria-label': t('news.compose.contentLabel') } },
  });

  useEffect(() => {
    if (editor) onReady(editor);
  }, [editor, onReady]);

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      paragraph: e?.isActive('paragraph') ?? false,
      section: e?.isActive('heading', { level: 2 }) ?? false,
      subsection: e?.isActive('heading', { level: 3 }) ?? false,
      bold: e?.isActive('bold') ?? false,
      italic: e?.isActive('italic') ?? false,
      underline: e?.isActive('underline') ?? false,
      strike: e?.isActive('strike') ?? false,
      link: e?.isActive('link') ?? false,
      inHeading: e?.isActive('heading') ?? false,
    }),
  });

  if (!editor || !state) return null;

  function editLink(e: Editor) {
    const current = (e.getAttributes('link').href as string | undefined) ?? '';
    const href = window.prompt(t('studio.web.editor.linkPrompt'), current);
    if (href === null) return;
    if (href.trim() === '') {
      e.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    if (!LINK_PATTERN.test(href.trim())) {
      window.alert(t('studio.web.editor.linkInvalid'));
      return;
    }
    e.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
  }

  async function insertImage(event: ChangeEvent<HTMLInputElement>, e: Editor) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const image = await prepareImage(file);
      const pendingKey = holdPendingImage(image);
      e.chain()
        .focus()
        .insertContent([
          { type: 'newsImage', attrs: { pendingKey, width: image.width, height: image.height } },
          { type: 'paragraph' },
        ])
        .run();
    } catch {
      onImageError();
    }
  }

  const tool = (label: string, active: boolean, run: () => void, text: string, disabled = false, look = '') => (
    <button
      type="button"
      className={`tool${look ? ` ${look}` : ''}${active ? ' active' : ''}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      disabled={disabled}
      onMouseDown={(ev) => ev.preventDefault()}
      onClick={run}
    >
      {text}
    </button>
  );

  const inline = state.inHeading;
  return (
    <div className="news-editor">
      <div className="toolbar" role="toolbar">
        {tool(t('news.compose.block.paragraph'), state.paragraph, () => editor.chain().focus().setParagraph().run(), t('news.compose.block.paragraph'))}
        {tool(t('news.compose.format.section'), state.section, () => editor.chain().focus().toggleHeading({ level: 2 }).run(), t('news.compose.format.section'))}
        {tool(t('news.compose.format.subsection'), state.subsection, () => editor.chain().focus().toggleHeading({ level: 3 }).run(), t('news.compose.format.subsection'))}
        <span className="tool-gap" />
        {tool(t('news.compose.format.bold'), state.bold, () => editor.chain().focus().toggleBold().run(), 'B', inline, 'look-bold')}
        {tool(t('news.compose.format.italic'), state.italic, () => editor.chain().focus().toggleItalic().run(), 'I', inline, 'look-italic')}
        {tool(t('news.compose.format.underline'), state.underline, () => editor.chain().focus().toggleUnderline().run(), 'U', inline, 'look-underline')}
        {tool(t('news.compose.format.strikethrough'), state.strike, () => editor.chain().focus().toggleStrike().run(), 'S', inline, 'look-strike')}
        {tool(t('news.compose.format.link'), state.link, () => editLink(editor), t('news.compose.format.link'), inline)}
        <span className="tool-gap" />
        {tool(
          t('news.compose.block.addImage'),
          false,
          () => fileInput.current?.click(),
          t('news.compose.block.addImage'),
          imageCount(editor) >= MAX_IMAGES,
        )}
        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          hidden
          onChange={(ev) => void insertImage(ev, editor)}
        />
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

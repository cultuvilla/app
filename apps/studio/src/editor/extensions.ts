import { Node, mergeAttributes, type Extensions } from '@tiptap/core';
import { Heading } from '@tiptap/extension-heading';
import { Mention } from '@tiptap/extension-mention';
import { Placeholder } from '@tiptap/extension-placeholder';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { StarterKit } from '@tiptap/starter-kit';
import type { MentionCandidate } from '@cultuvilla/shared/services/mentionCandidateService';
import { t } from '../i18n';
import { NewsImageView } from './NewsImageView';
import { mentionSuggestion } from './mentionSuggestion';

/**
 * An inline image with its caption as the node's content, so a caption takes
 * marks, links and mentions like the prose does — as the stored image block
 * does. `pendingKey` names a picked image that is uploaded on save.
 */
export const NewsImage = Node.create({
  name: 'newsImage',
  group: 'block',
  content: 'inline*',
  draggable: true,
  isolating: true,

  addAttributes() {
    return {
      storagePath: { default: null },
      width: { default: 0 },
      height: { default: 0 },
      pendingKey: { default: null },
    };
  },

  parseHTML() {
    return [{ tag: 'figure[data-news-image]', contentElement: 'figcaption' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['figure', mergeAttributes(HTMLAttributes, { 'data-news-image': '' }), ['figcaption', 0]];
  },

  addNodeView() {
    return ReactNodeViewRenderer(NewsImageView);
  },

  addKeyboardShortcuts() {
    return {
      // Enter in a caption leaves it for a new paragraph below the image.
      Enter: ({ editor }) => {
        const { $from } = editor.state.selection;
        if ($from.parent.type.name !== this.name) return false;
        const after = $from.after();
        return editor.chain().insertContentAt(after, { type: 'paragraph' }).focus(after + 1).run();
      },
    };
  },
});

/** Titles are plain text in the stored model: no marks, mentions or breaks. */
const PlainHeading = Heading.extend({ content: 'text*', marks: '' }).configure({ levels: [2, 3] });

const NewsMention = Mention.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      entityType: { default: null },
      /** The characters shown in the prose; `label` keeps the entity's name. */
      text: { default: null },
    };
  },
});

export function newsEditorExtensions(candidates: () => MentionCandidate[]): Extensions {
  return [
    // Only what the stored article can hold: no lists, quotes or code.
    StarterKit.configure({
      heading: false,
      blockquote: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      code: false,
      codeBlock: false,
      horizontalRule: false,
      link: { openOnClick: false, autolink: false, linkOnPaste: true, protocols: ['http', 'https'] },
    }),
    PlainHeading,
    NewsImage,
    NewsMention.configure({
      HTMLAttributes: { class: 'mention' },
      renderText: ({ node }) => String(node.attrs.text ?? node.attrs.label ?? ''),
      renderHTML: ({ options, node }) => [
        'span',
        mergeAttributes(options.HTMLAttributes, { 'data-entity-type': node.attrs.entityType }),
        String(node.attrs.text ?? node.attrs.label ?? ''),
      ],
      suggestion: mentionSuggestion(candidates),
    }),
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === 'heading'
          ? t(node.attrs.level === 2 ? 'news.compose.block.sectionPlaceholder' : 'news.compose.block.subsectionPlaceholder')
          : node.type.name === 'newsImage'
            ? t('news.compose.block.captionPlaceholder')
            : t('studio.web.editor.bodyPlaceholder'),
      includeChildren: true,
    }),
  ];
}

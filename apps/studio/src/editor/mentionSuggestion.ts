import { ReactRenderer } from '@tiptap/react';
import type { MentionNodeAttrs } from '@tiptap/extension-mention';
import type { SuggestionOptions, SuggestionProps } from '@tiptap/suggestion';
import type { MentionCandidate } from '@cultuvilla/shared/services/mentionCandidateService';
import { filterMentionCandidates } from './mentionFilter';
import { MentionList, type MentionListHandle, type MentionListProps } from './MentionList';

type Props = SuggestionProps<MentionCandidate, MentionNodeAttrs>;

function place(element: HTMLElement, props: Props): void {
  const rect = props.clientRect?.();
  if (!rect) return;
  element.style.left = `${rect.left + window.scrollX}px`;
  element.style.top = `${rect.bottom + window.scrollY + 6}px`;
}

/** The `@` popup: the pueblo's entities, filtered as the author types. */
export function mentionSuggestion(
  candidates: () => MentionCandidate[],
): Omit<SuggestionOptions<MentionCandidate, MentionNodeAttrs>, 'editor'> {
  return {
    char: '@',
    items: ({ query }) => filterMentionCandidates(candidates(), query),
    command: ({ editor, range, props }) => {
      editor
        .chain()
        .focus()
        .insertContentAt(range, [
          { type: 'mention', attrs: props },
          { type: 'text', text: ' ' },
        ])
        .run();
    },
    render: () => {
      let renderer: ReactRenderer<MentionListHandle, MentionListProps> | null = null;
      let host: HTMLElement | null = null;
      return {
        onStart: (props) => {
          renderer = new ReactRenderer(MentionList, { props, editor: props.editor });
          host = document.createElement('div');
          host.className = 'mention-popup';
          host.appendChild(renderer.element);
          document.body.appendChild(host);
          place(host, props);
        },
        onUpdate: (props) => {
          renderer?.updateProps(props);
          if (host) place(host, props);
        },
        onKeyDown: ({ event }) => {
          if (event.key === 'Escape') {
            host?.remove();
            return true;
          }
          return renderer?.ref?.onKeyDown(event) ?? false;
        },
        onExit: () => {
          host?.remove();
          renderer?.destroy();
          renderer = null;
          host = null;
        },
      };
    },
  };
}

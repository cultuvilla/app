import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import type { MentionCandidate } from '@cultuvilla/shared/services/mentionCandidateService';
import { t } from '../i18n';

export interface MentionAttrs {
  id: string;
  label: string;
  entityType: MentionCandidate['entityType'];
  text: string;
}

export interface MentionListProps {
  items: MentionCandidate[];
  command: (attrs: MentionAttrs) => void;
}

export interface MentionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export const MentionList = forwardRef<MentionListHandle, MentionListProps>(function MentionList({ items, command }, ref) {
  const [active, setActive] = useState(0);
  useEffect(() => setActive(0), [items]);

  const pick = (index: number) => {
    const item = items[index];
    if (item) command({ id: item.entityId, label: item.label, entityType: item.entityType, text: item.label });
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: (event) => {
      if (items.length === 0) return false;
      if (event.key === 'ArrowDown') {
        setActive((i) => (i + 1) % items.length);
        return true;
      }
      if (event.key === 'ArrowUp') {
        setActive((i) => (i - 1 + items.length) % items.length);
        return true;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        pick(active);
        return true;
      }
      return false;
    },
  }));

  return (
    <div className="mention-list" role="listbox">
      {items.length === 0 ? (
        <div className="mention-empty">{t('studio.web.editor.mentionEmpty')}</div>
      ) : (
        items.map((item, i) => (
          <button
            key={`${item.entityType}:${item.entityId}`}
            type="button"
            role="option"
            aria-selected={i === active}
            className={i === active ? 'active' : undefined}
            onMouseDown={(e) => {
              e.preventDefault();
              pick(i);
            }}
          >
            <span>{item.label}</span>
            <span className="mention-kind">{t(`news.compose.mentionType.${item.entityType}`)}</span>
          </button>
        ))
      )}
    </div>
  );
});

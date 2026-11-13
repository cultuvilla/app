import { useEffect, useState } from 'react';
import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react';
import { newsImageDownloadURL } from '@cultuvilla/shared/services/imageService';
import { t } from '../i18n';
import { pendingImage } from './images';

function useImageSource(storagePath: string | null, pendingKey: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (pendingKey) {
      setUrl(pendingImage(pendingKey)?.previewUrl ?? null);
      return;
    }
    if (!storagePath) return;
    let cancelled = false;
    newsImageDownloadURL(storagePath).then(
      (u) => {
        if (!cancelled) setUrl(u);
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [storagePath, pendingKey]);
  return url;
}

export function NewsImageView({ node, deleteNode, selected }: ReactNodeViewProps) {
  const storagePath = (node.attrs.storagePath as string | null) ?? null;
  const pendingKey = (node.attrs.pendingKey as string | null) ?? null;
  const width = Number(node.attrs.width) || 16;
  const height = Number(node.attrs.height) || 9;
  const src = useImageSource(storagePath, pendingKey);
  const emptyCaption = node.content.size === 0;

  return (
    <NodeViewWrapper as="figure" className={`news-image${selected ? ' selected' : ''}`} data-news-image="">
      <div className="news-image-frame" contentEditable={false} style={{ aspectRatio: `${width} / ${height}` }}>
        {src ? <img src={src} alt="" draggable={false} /> : null}
        <button
          type="button"
          className="news-image-remove"
          onClick={deleteNode}
          aria-label={t('news.compose.block.removeImage')}
          title={t('news.compose.block.removeImage')}
        >
          ×
        </button>
      </div>
      <NodeViewContent<'figcaption'>
        as="figcaption"
        className={emptyCaption ? 'is-empty' : undefined}
        data-placeholder={t('news.compose.block.captionPlaceholder')}
      />
    </NodeViewWrapper>
  );
}

import type { Editor } from '@tiptap/react';
import type { NewsDoc } from '@cultuvilla/shared/models/news/newsDocument';
import { forgetPendingImage, pendingImage, type PickedImage } from './images';

export function editorDoc(editor: Editor): NewsDoc {
  return editor.getJSON() as NewsDoc;
}

/** The document without the images still waiting for upload. */
export function withoutPendingImages(doc: NewsDoc): NewsDoc {
  return { ...doc, content: doc.content.filter((b) => b.type !== 'newsImage' || b.attrs.storagePath) };
}

/**
 * Uploads every image inserted since the last save and writes its storage
 * path into its node, so the document converts and the next save does not
 * upload it again.
 */
export async function uploadPendingImages(
  editor: Editor,
  upload: (image: PickedImage, index: number) => Promise<string>,
): Promise<void> {
  const keys: string[] = [];
  editor.state.doc.descendants((node) => {
    const key = node.type.name === 'newsImage' ? (node.attrs.pendingKey as string | null) : null;
    if (key && !node.attrs.storagePath) keys.push(key);
  });

  const paths = new Map<string, string>();
  for (const [i, key] of keys.entries()) {
    const image = pendingImage(key);
    if (image) paths.set(key, await upload(image, i));
  }

  const { tr } = editor.state;
  editor.state.doc.descendants((node, pos) => {
    const key = node.type.name === 'newsImage' ? (node.attrs.pendingKey as string | null) : null;
    const storagePath = key ? paths.get(key) : undefined;
    if (storagePath) tr.setNodeMarkup(pos, undefined, { ...node.attrs, storagePath, pendingKey: null });
  });
  if (tr.docChanged) editor.view.dispatch(tr);
  for (const key of paths.keys()) forgetPendingImage(key);
}

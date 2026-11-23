import { STUDIO_PAIRING_SEGMENT, STUDIO_SEGMENT, studioPairingPath } from '@cultuvilla/shared/utils/urls';

export type StudioRoute =
  | { name: 'articles' }
  | { name: 'newArticle' }
  | { name: 'article'; id: string }
  /** The QR code opened on a phone without the app. */
  | { name: 'pairing'; pairingId: string };

const ARTICLES_SEGMENT = 'articulos';
const NEW_SEGMENT = 'nuevo';

export function parseStudioPath(pathname: string): StudioRoute | null {
  const [root, second, third, ...rest] = pathname.split('/').filter(Boolean);
  if (root !== STUDIO_SEGMENT || rest.length > 0) return null;
  if (!second) return { name: 'articles' };
  if (second === STUDIO_PAIRING_SEGMENT && third) return { name: 'pairing', pairingId: third };
  if (second !== ARTICLES_SEGMENT) return null;
  if (!third) return { name: 'articles' };
  return third === NEW_SEGMENT ? { name: 'newArticle' } : { name: 'article', id: third };
}

export function studioPath(route: StudioRoute): string {
  switch (route.name) {
    case 'articles':
      return `/${STUDIO_SEGMENT}`;
    case 'newArticle':
      return `/${STUDIO_SEGMENT}/${ARTICLES_SEGMENT}/${NEW_SEGMENT}`;
    case 'article':
      return `/${STUDIO_SEGMENT}/${ARTICLES_SEGMENT}/${encodeURIComponent(route.id)}`;
    case 'pairing':
      return studioPairingPath(route.pairingId);
  }
}

import { APP_SCHEME, APP_STORE_ID } from '@cultuvilla/shared/config';
import { html, raw, render, type Child, type SafeHtml } from './html';
import { LANDING_STYLES, STYLES } from './styles';

const SITE_NAME = 'Cultuvilla';
export const DEFAULT_DESCRIPTION = 'Eventos, noticias y vida de tu pueblo.';

export interface PageHead {
  title: string;
  description?: string | null;
  imageUrl?: string | null;
  /** Keep the page out of search: invite links, app-only screens, private content. */
  noindex?: boolean;
  /** schema.org node; serialised into a JSON-LD script. */
  jsonLd?: Record<string, unknown> | null;
}

export interface Page {
  head: PageHead;
  body: SafeHtml;
  /** HTTP status; 200 unless the page says otherwise. */
  status?: number;
  /** `landing` lets the body run full-bleed bands instead of the reading column. */
  layout?: 'landing';
}

export interface DocumentContext {
  /** Canonical URL of this page on the project's public origin. */
  canonical: string;
  /** Path the app would open for this page — the CTA and the Safari banner hand it over. */
  appPath: string;
}

function jsonLdScript(node: Record<string, unknown>): SafeHtml {
  // JSON inside <script> must not be able to close the tag early.
  const json = JSON.stringify({ '@context': 'https://schema.org', ...node }).replace(/</g, '\\u003c');
  return raw(`<script type="application/ld+json">${json}</script>`);
}

/**
 * "Abrir en la app": try the installed app through its scheme, and when nothing
 * takes the hand-off (no app, or a desktop) fall through to /descarga, which
 * picks the right store. Every action on the read site goes through here — the
 * web reads, the app does (docs/decisions/web-is-a-read-site.md).
 */
export function appCta(appPath: string, label: string, variant: 'small' | 'block' = 'block'): SafeHtml {
  return html`<a class="cta ${variant}" href="/descarga" data-app-path="${appPath}">${label}</a>`;
}

const CTA_SCRIPT = raw(`<script>
document.addEventListener('click',function(e){
  var a=e.target.closest&&e.target.closest('a[data-app-path]');
  if(!a||!/iPhone|iPad|iPod|Android/i.test(navigator.userAgent))return;
  e.preventDefault();
  var left=false;
  document.addEventListener('visibilitychange',function(){if(document.hidden)left=true;},{once:true});
  location.href='${APP_SCHEME}:/'+a.getAttribute('data-app-path');
  setTimeout(function(){if(!left)location.href=a.href;},1200);
});
</script>`);

export function renderDocument(page: Page, ctx: DocumentContext): string {
  const { head } = page;
  const landing = page.layout === 'landing';
  const header = html`<header class="site"><a class="brand" href="/"><img src="/brand/logo-96.png" alt="Cultuvilla" width="32" height="32"/><span>Cultuvilla</span></a><nav><a href="/pueblos">Pueblos</a>${appCta(ctx.appPath, 'Abrir en la app', 'small')}</nav></header>`;
  const footer = html`<footer class="site"><a href="/descarga">Descargar la app</a><a href="/legal/privacidad">Privacidad</a><a href="/legal/terminos">Términos</a><a href="/legal/eliminar-cuenta">Eliminar cuenta</a></footer>`;
  const title = head.title === SITE_NAME ? SITE_NAME : `${head.title} · ${SITE_NAME}`;
  const description = head.description || DEFAULT_DESCRIPTION;
  const image: Child = head.imageUrl
    ? html`<meta property="og:image" content="${head.imageUrl}"/><meta name="twitter:image" content="${head.imageUrl}"/>`
    : null;

  return (
    '<!doctype html>' +
    render(html`<html lang="es"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${title}</title>
<meta name="description" content="${description}"/>
<link rel="canonical" href="${ctx.canonical}"/>
${head.noindex ? html`<meta name="robots" content="noindex,follow"/>` : null}
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="${SITE_NAME}"/>
<meta property="og:url" content="${ctx.canonical}"/>
<meta property="og:title" content="${head.title}"/>
<meta property="og:description" content="${description}"/>
<meta name="twitter:card" content="${head.imageUrl ? 'summary_large_image' : 'summary'}"/>
${image}
<meta name="apple-itunes-app" content="app-id=${APP_STORE_ID}, app-argument=${ctx.canonical}"/>
<meta name="theme-color" content="#f9f0e8"/>
<link rel="icon" href="/brand/favicon.png"/>
<style>${raw(STYLES)}</style>
${landing ? html`<link rel="preload" href="/brand/gloock-latin.woff2" as="font" type="font/woff2" crossorigin/><style>${raw(LANDING_STYLES)}</style>` : null}
${head.jsonLd ? jsonLdScript(head.jsonLd) : null}
</head><body>
${landing ? html`<div class="wrap">${header}</div><main class="landing">${page.body}</main><div class="wrap">${footer}</div>` : html`<div class="wrap">${header}<main>${page.body}</main>${footer}</div>`}
${CTA_SCRIPT}
</body></html>`)
  );
}

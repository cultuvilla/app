import { describe, it, expect } from 'vitest';
import { renderDocument } from '../../web/document';
import { html } from '../../web/html';

const ctx = { canonical: 'https://cultuvilla.es/matabuena/evento/fiestas_e1', appPath: '/matabuena/evento/fiestas_e1' };

function doc(head: Parameters<typeof renderDocument>[0]['head']): string {
  return renderDocument({ head, body: html`<p>cuerpo</p>` }, ctx);
}

describe('renderDocument', () => {
  it('is a Spanish HTML document with one title, description and canonical', () => {
    const out = doc({ title: 'Fiestas', description: 'Del 14 al 18' });
    expect(out.startsWith('<!doctype html><html lang="es">')).toBe(true);
    expect(out.match(/<title>/g)).toHaveLength(1);
    expect(out).toContain('<title>Fiestas · Cultuvilla</title>');
    expect(out).toContain('<meta name="description" content="Del 14 al 18"/>');
    expect(out).toContain(`<link rel="canonical" href="${ctx.canonical}"/>`);
    expect(out).toContain('<p>cuerpo</p>');
  });

  it('escapes user-written head fields', () => {
    const out = doc({ title: '"><script>x</script>', description: null });
    expect(out).not.toContain('<script>x</script>');
  });

  it('adds image tags only when there is an image', () => {
    expect(doc({ title: 'a' })).not.toContain('og:image');
    expect(doc({ title: 'a', imageUrl: 'https://img/x.jpg' })).toContain(
      '<meta property="og:image" content="https://img/x.jpg"/>',
    );
  });

  it('marks noindex pages', () => {
    expect(doc({ title: 'a', noindex: true })).toContain('<meta name="robots" content="noindex,follow"/>');
    expect(doc({ title: 'a' })).not.toContain('name="robots"');
  });

  it('hands the page to the app: Safari banner and CTA carry the path', () => {
    const out = doc({ title: 'a' });
    expect(out).toContain(`app-argument=${ctx.canonical}`);
    expect(out).toContain(`data-app-path="${ctx.appPath}"`);
  });

  it('serialises JSON-LD without letting it close the script tag', () => {
    const out = doc({ title: 'a', jsonLd: { '@type': 'Event', name: '</script><b>' } });
    expect(out).toContain('"@context":"https://schema.org"');
    expect(out).not.toContain('</script><b>');
  });

  it('links every page, not just the landing, to the /pueblos directory from its header', () => {
    const out = doc({ title: 'a' });
    const header = out.slice(out.indexOf('<header class="site">'), out.indexOf('</header>'));
    expect(header).toContain('<a href="/pueblos">Pueblos</a>');
    expect(header).toContain('<a class="wide" href="/embajadores">Embajadores</a>');
  });

  it('signs every page with the CULTUVILLA lettering, not plain text', () => {
    const out = doc({ title: 'a' });
    const header = out.slice(out.indexOf('<header class="site">'), out.indexOf('</header>'));
    expect(header).toContain('src="/brand/cultuvilla-lettering.svg" alt="Cultuvilla"');
  });
});

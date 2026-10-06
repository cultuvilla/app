import { describe, it, expect } from 'vitest';
import { richText } from '../../web/richText';
import { render } from '../../web/html';

const ctx = { villageSlug: 'matabuena' };

describe('richText', () => {
  it('escapes plain text and keeps line breaks', () => {
    expect(render(richText({ text: 'a<b>\nc' }, ctx))).toBe('a&lt;b&gt;<br/>c');
  });

  it('links mentions to their village-scoped page', () => {
    const out = render(
      richText(
        { text: 'Con la Peña El Toro', mentions: [{ entityType: 'organization', entityId: 'o1', label: 'Peña El Toro', offset: 7, length: 12 }] },
        ctx,
      ),
    );
    expect(out).toBe('Con la <a href="/matabuena/entidad/pena-el-toro_o1">Peña El Toro</a>');
  });

  it('renders a mention with no page of its own as text', () => {
    const out = render(
      richText({ text: 'En Soria', mentions: [{ entityType: 'village', entityId: 'm2', label: 'Soria', offset: 3, length: 5 }] }, ctx),
    );
    expect(out).toBe('En Soria');
  });

  it('applies links and overlapping marks', () => {
    const out = render(
      richText(
        {
          text: 'ver web hoy',
          links: [{ url: 'https://x.es', offset: 4, length: 3 }],
          marks: [{ type: 'bold', offset: 0, length: 7 }],
        },
        ctx,
      ),
    );
    expect(out).toBe('<strong>ver </strong><a href="https://x.es" rel="nofollow ugc"><strong>web</strong></a> hoy');
  });

  it('autolinks bare URLs and never links a non-http scheme', () => {
    expect(render(richText({ text: 'Mira https://a.es/x. Fin' }, ctx))).toBe(
      'Mira <a href="https://a.es/x" rel="nofollow ugc">https://a.es/x</a>. Fin',
    );
    const out = render(richText({ text: 'clic', links: [{ url: 'javascript:alert(1)', offset: 0, length: 4 }] }, ctx));
    expect(out).toBe('clic');
  });

  it('ignores spans that fall outside the text', () => {
    expect(render(richText({ text: 'abc', marks: [{ type: 'italic', offset: 2, length: 9 }] }, ctx))).toBe(
      'ab<em>c</em>',
    );
  });
});

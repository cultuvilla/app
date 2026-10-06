import { describe, it, expect } from 'vitest';
import { html, raw, render } from '../../web/html';

describe('html', () => {
  it('escapes interpolated text', () => {
    expect(render(html`<p>${'<script>"&'}</p>`)).toBe('<p>&lt;script&gt;&quot;&amp;</p>');
  });

  it('does not re-escape nested fragments', () => {
    const inner = html`<b>${'a&b'}</b>`;
    expect(render(html`<p>${inner}</p>`)).toBe('<p><b>a&amp;b</b></p>');
  });

  it('joins arrays and drops null, undefined and false', () => {
    const items = ['x', 'y'].map((s) => html`<li>${s}</li>`);
    expect(render(html`<ul>${items}${null}${undefined}${false}</ul>`)).toBe('<ul><li>x</li><li>y</li></ul>');
  });

  it('renders numbers', () => {
    expect(render(html`<i>${3}</i>`)).toBe('<i>3</i>');
  });

  it('passes raw markup through untouched', () => {
    expect(render(html`<head>${raw('<style>a>b{}</style>')}</head>`)).toBe('<head><style>a>b{}</style></head>');
  });
});

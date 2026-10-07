import { escapeHtml } from './escape';

/**
 * Markup that is already safe to emit. Only `html` and `raw` construct it, so
 * any plain string reaching a template is escaped — the read site renders
 * user-written titles and descriptions, and escaping by default is what keeps
 * one of them from becoming markup.
 */
export class SafeHtml {
  constructor(readonly value: string) {}
}

export type Child = SafeHtml | string | number | null | undefined | false | readonly Child[];

function serialize(child: Child): string {
  if (child === null || child === undefined || child === false) return '';
  if (child instanceof SafeHtml) return child.value;
  if (typeof child === 'string') return escapeHtml(child);
  if (typeof child === 'number') return String(child);
  return child.map(serialize).join('');
}

export function html(strings: TemplateStringsArray, ...values: Child[]): SafeHtml {
  let out = strings[0];
  values.forEach((value, i) => {
    out += serialize(value) + (strings[i + 1] ?? '');
  });
  return new SafeHtml(out);
}

/** Trusted markup only: inline CSS, JSON-LD built by us. Never user content. */
export function raw(markup: string): SafeHtml {
  return new SafeHtml(markup);
}

export function render(fragment: SafeHtml): string {
  return fragment.value;
}

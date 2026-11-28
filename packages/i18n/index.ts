import es from './messages/es.json' with { type: 'json' };

export type Locale = 'es';

const CATALOGS: Record<Locale, Record<string, unknown>> = {
  es,
};

export function getMessages(locale: Locale): Record<string, unknown> {
  return CATALOGS[locale];
}

export const SUPPORTED_LOCALES: Locale[] = ['es'];
export const DEFAULT_LOCALE: Locale = 'es';

export type MessageVars = Record<string, string | number>;

// Minimal ICU plural support: `{name, plural, one {…} other {…}}`. Spanish (and
// our only locale) uses `one` for n===1, `other` otherwise. Sub-messages here
// never nest braces, so a single regex pass is enough; `#` is replaced with n.
const PLURAL_RE = /\{(\w+),\s*plural,\s*one\s*\{([^{}]*)\}\s*other\s*\{([^{}]*)\}\s*\}/g;

/**
 * A template with every plural `format` understands removed. Any `plural,`
 * still in the result is one the formatter would print as raw ICU text; the
 * catalog test `countPlurals.test.ts` reads plurals through this, not a copy.
 */
export function stripPlurals(tpl: string): string {
  return tpl.replace(PLURAL_RE, '');
}

function applyPlurals(tpl: string, vars: MessageVars): string {
  return tpl.replace(PLURAL_RE, (_match, name: string, one: string, other: string) => {
    const n = Number(vars[name]);
    if (Number.isNaN(n)) return `{${name}}`;
    return (n === 1 ? one : other).replace(/#/g, String(n));
  });
}

/** Walk a nested catalog by a dot-separated key; undefined unless it ends on a string. */
export function lookup(messages: Record<string, unknown>, key: string): string | undefined {
  let current: unknown = messages;
  for (const seg of key.split('.')) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[seg];
  }
  return typeof current === 'string' ? current : undefined;
}

/** Fill a template's ICU plurals and `{name}` placeholders. */
export function format(tpl: string, vars?: MessageVars): string {
  if (!vars) return tpl;
  return applyPlurals(tpl, vars).replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

/**
 * One message from a catalog, formatted — the key itself when it is missing.
 * The app's `useT()` and the server-rendered read site both go through this.
 */
export function translate(messages: Record<string, unknown>, key: string, vars?: MessageVars): string {
  const tpl = lookup(messages, key);
  return tpl === undefined ? key : format(tpl, vars);
}

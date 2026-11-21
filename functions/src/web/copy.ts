import { getMessages, lookup, translate, type MessageVars } from '@cultuvilla/i18n';

/**
 * The read site's Spanish copy, from the app's own catalog, so a count or a
 * label fixed for the app is fixed on the web too. Copy that exists only on the
 * web stays inline where it is used.
 */
const ES = getMessages('es');

export function msg(key: string, vars?: MessageVars): string {
  return translate(ES, key, vars);
}

/** The catalog's label for an enum value under `namespace`, or null when it has none. */
export function enumLabel(namespace: string, value: string | null): string | null {
  return value ? (lookup(ES, `${namespace}.${value}`) ?? null) : null;
}

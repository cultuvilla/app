import { DEFAULT_LOCALE, getMessages } from '@cultuvilla/i18n';

const messages = getMessages(DEFAULT_LOCALE);

/** The app's message catalog, read the way the app's `useT()` reads it. */
export function t(key: string, vars?: Record<string, string | number>): string {
  const value = key
    .split('.')
    .reduce<unknown>(
      (node, part) => (node && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
      messages,
    );
  if (typeof value !== 'string') return key;
  if (!vars) return value;
  return value.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

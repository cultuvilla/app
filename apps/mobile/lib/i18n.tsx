import { createContext, useContext, type ReactNode } from 'react';
import * as Localization from 'expo-localization';
import { format, getMessages, lookup } from '@cultuvilla/i18n';

export type Locale = string;
// Nested catalog: values can be strings or nested objects
export type MessageBundle = Record<Locale, Record<string, unknown>>;

export type I18n = {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

export function createI18n(
  bundle: MessageBundle,
  locale: Locale,
  fallback: Locale = 'es',
): I18n {
  function resolve(key: string): string | undefined {
    const localeCatalog = bundle[locale];
    const fallbackCatalog = bundle[fallback];
    const fromLocale = localeCatalog ? lookup(localeCatalog, key) : undefined;
    if (fromLocale !== undefined) return fromLocale;
    return fallbackCatalog ? lookup(fallbackCatalog, key) : undefined;
  }

  return {
    locale,
    t(key, vars) {
      const tpl = resolve(key);
      return tpl === undefined ? key : format(tpl, vars);
    },
  };
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const device = Localization.getLocales()[0]?.languageCode ?? 'es';
  const bundled: MessageBundle = { es: getMessages('es') };
  const value = createI18n(bundled, device, 'es');
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useT(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error('useT must be inside <I18nProvider>');
  return v;
}

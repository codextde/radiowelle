import { getLocales } from 'expo-localization';
import { useCallback } from 'react';

import countryNames from '@/data/country-names.json';
import { useSettings } from '@/store/settings';

import { cs } from './locales/cs';
import { da } from './locales/da';
import { de } from './locales/de';
import { en, type Dictionary, type TranslationKey } from './locales/en';
import { es } from './locales/es';
import { fr } from './locales/fr';
import { it } from './locales/it';
import { nl } from './locales/nl';
import { pl } from './locales/pl';
import { pt } from './locales/pt';
import { ru } from './locales/ru';
import { sv } from './locales/sv';
import { tr } from './locales/tr';
import { uk } from './locales/uk';

export const dictionaries: Record<string, Dictionary> = { en, de, fr, es, it, nl, pl, pt, tr, uk, ru, cs, sv, da };

export const languages = [
  { code: 'de', name: 'Deutsch' },
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'es', name: 'Español' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'pt', name: 'Português' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'cs', name: 'Čeština' },
  { code: 'da', name: 'Dansk' },
  { code: 'sv', name: 'Svenska' },
  { code: 'uk', name: 'Українська' },
  { code: 'ru', name: 'Русский' },
] as const;

export type Language = string;

export function systemLanguage(): Language {
  for (const locale of getLocales()) {
    const code = locale.languageCode ?? '';
    if (dictionaries[code]) return code;
  }
  return 'en';
}

export function resolveLanguage(preference: string): Language {
  if (preference !== 'system' && dictionaries[preference]) return preference;
  return systemLanguage();
}

type Params = Record<string, string | number>;

function plural(language: Language, count: number) {
  const n = Math.abs(count);
  if (!Number.isInteger(n)) return language === 'cs' ? 'many' : 'other';
  const mod10 = n % 10;
  const mod100 = n % 100;
  switch (language) {
    case 'fr':
      return n === 0 || n === 1 ? 'one' : 'other';
    case 'pl':
      if (n === 1) return 'one';
      return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'few' : 'many';
    case 'ru':
    case 'uk':
      if (mod10 === 1 && mod100 !== 11) return 'one';
      return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'few' : 'many';
    case 'cs':
      if (n === 1) return 'one';
      return n >= 2 && n <= 4 ? 'few' : 'other';
    default:
      return n === 1 ? 'one' : 'other';
  }
}

export function formatTime(language: Language, date: Date, withDay = false) {
  try {
    return new Intl.DateTimeFormat(language, withDay ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { hour: '2-digit', minute: '2-digit' }).format(date);
  } catch {
    const hm = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    return withDay ? `${date.getDate()}.${date.getMonth() + 1}. ${hm}` : hm;
  }
}

export function translate(language: Language, key: TranslationKey | string, params?: Params): string {
  const dict = dictionaries[language] ?? en;
  let resolvedKey = key as string;
  if (params && typeof params.count === 'number') {
    const candidate = `${key}_${plural(language, params.count)}`;
    if (candidate in dict || candidate in en) resolvedKey = candidate;
    else if (`${key}_other` in dict) resolvedKey = `${key}_other`;
  }
  let text = (dict as Record<string, string>)[resolvedKey] ?? (en as Record<string, string>)[resolvedKey] ?? resolvedKey;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.split(`{${name}}`).join(typeof value === 'number' ? formatNumber(language, value) : value);
    }
  }
  return text;
}

export function formatNumber(language: Language, value: number) {
  try {
    return new Intl.NumberFormat(language).format(value);
  } catch {
    return String(value);
  }
}

export function useLanguage(): Language {
  const preference = useSettings((s) => s.language);
  return resolveLanguage(preference);
}

export function useT() {
  const language = useLanguage();
  return useCallback(
    (key: TranslationKey | `${string}.${string}`, params?: Params) => translate(language, key, params),
    [language]
  );
}

export function currentLanguage() {
  return resolveLanguage(useSettings.getState().language);
}

export function t(key: TranslationKey | `${string}.${string}`, params?: Params) {
  return translate(currentLanguage(), key, params);
}

let displayNames: { language: string; names: Intl.DisplayNames | null } | null = null;

const names = countryNames as Record<string, Record<string, string>>;

export function countryName(code: string, language: Language = currentLanguage(), fallback?: string) {
  const upper = code.toUpperCase();
  const bundled = names[language]?.[upper] ?? names.en?.[upper];
  if (bundled) return bundled;
  if (!displayNames || displayNames.language !== language) {
    let names: Intl.DisplayNames | null = null;
    try {
      names = new Intl.DisplayNames([language], { type: 'region' });
    } catch {
      names = null;
    }
    displayNames = { language, names };
  }
  try {
    const name = displayNames.names?.of(code.toUpperCase());
    if (name && name !== code.toUpperCase()) return name;
  } catch {}
  return fallback ?? code.toUpperCase();
}

export type { TranslationKey };

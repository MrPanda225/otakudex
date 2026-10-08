import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { MessageParams } from '../../../shared/i18n/format.ts';
import { DEFAULT_LANG, isLang, resolveLang, type Lang } from '../../../shared/i18n/lang.ts';
import { FRENCH_ACCESS, loadAccess, loadApp, type Catalogue, type MessageKey } from './catalogue.ts';
import { createTranslate, type Translate } from './translate.ts';

const STORAGE_KEY = 'otakudex.lang';

export type { MessageKey } from './catalogue.ts';
export type { Translate } from './translate.ts';

interface I18nValue {
  lang: Lang;
  t: Translate;
  /** Switches the whole interface; the page keeps its state because nothing is reloaded. */
  setLang: (lang: Lang) => void;
  /** The application's own texts load with the application, not with the sign-in screens. */
  isAppReady: boolean;
  loadAppMessages: () => void;
}

const I18nContext = createContext<I18nValue | null>(null);

let activeLang: Lang = DEFAULT_LANG;
let activeTranslate: Translate = (key) => key;
/** The language on screen, for code that is not a component (the API client sends it with each request). */
export function currentLang(): Lang {
  return activeLang;
}

/** `t` for code that is not a component (the API client words its own failures). */
export function translateNow(key: MessageKey, params?: MessageParams): string {
  return activeTranslate(key, params);
}

function readStoredLang(): Lang | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLang(stored) ? stored : null;
  } catch {
    return null; // storage blocked: the language is simply not remembered
  }
}

function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // not remembered; the choice still holds for this visit
  }
}

/** What a new visitor gets: the remembered choice, else English for an English browser, else French (FR-106). */
export function initialLang(): Lang {
  return readStoredLang() ?? resolveLang((navigator.languages ?? [navigator.language]).join(','));
}

/** Only in development: a missing text is a bug to fix before anyone sees it. */
function reportMissing(lang: Lang): ((key: string) => void) | undefined {
  return import.meta.env.DEV ? (key) => console.warn(`[i18n] missing text "${key}" in "${lang}"`) : undefined;
}

interface Loaded {
  lang: Lang;
  messages: Catalogue;
  hasApp: boolean;
}

export function I18nProvider({ children }: { children: ComponentChildren }) {
  const [loaded, setLoaded] = useState<Loaded | null>(() => {
    const lang = initialLang();
    return lang === 'fr' ? { lang, messages: FRENCH_ACCESS, hasApp: false } : null;
  });
  const latest = useRef(loaded);
  latest.current = loaded;

  // An English first visit has to wait for its small file; a French one is already inside the first file.
  useEffect(() => {
    if (loaded !== null) return;
    const lang = initialLang();
    void loadAccess(lang).then((messages) => setLoaded({ lang, messages, hasApp: false }));
  }, [loaded]);

  useEffect(() => {
    if (!loaded) return;
    activeLang = loaded.lang;
    activeTranslate = createTranslate(loaded.lang, loaded.messages, reportMissing(loaded.lang));
    document.documentElement.lang = loaded.lang;
  }, [loaded]);

  const setLang = useCallback((lang: Lang) => {
    const current = latest.current;
    if (!current || current.lang === lang) return;
    storeLang(lang);
    // Both files load first, then the text changes in one go: no half-translated screen, nothing reloads.
    void Promise.all([loadAccess(lang), current.hasApp ? loadApp(lang) : Promise.resolve(null)]).then(([access, app]) => {
      setLoaded({ lang, messages: app ? { ...access, ...app } : access, hasApp: app !== null });
    });
  }, []);

  const loadAppMessages = useCallback(() => {
    const current = latest.current;
    if (!current || current.hasApp) return;
    void loadApp(current.lang).then((app) => {
      setLoaded((now) => (now && now.lang === current.lang && !now.hasApp ? { ...now, messages: { ...now.messages, ...app }, hasApp: true } : now));
    });
  }, []);

  const value = useMemo<I18nValue | null>(
    () =>
      loaded
        ? { lang: loaded.lang, t: createTranslate(loaded.lang, loaded.messages, reportMissing(loaded.lang)), setLang, isAppReady: loaded.hasApp, loadAppMessages }
        : null,
    [loaded, setLang, loadAppMessages],
  );
  if (!value) return null;
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n must be used inside I18nProvider');
  return value;
}

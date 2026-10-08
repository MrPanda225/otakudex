import type { BaseKey } from '../../../shared/i18n/format.ts';
import type { Lang } from '../../../shared/i18n/lang.ts';
import { access as frAccess } from './messages/fr/access.ts';
import type { app as frApp } from './messages/fr/app.ts';

/** The texts of one language, by key. A text that depends on a number has a `.one` and a `.other` form. */
export type Catalogue = Readonly<Record<string, string>>;

/** Every key a component may ask for (the French catalogue is the reference; English must match it). */
export type MessageKey = BaseKey<keyof typeof frAccess | keyof typeof frApp>;

/**
 * Two catalogues per language. `access` is what the screens before sign-in say (the French one is part of the
 * first file, so the sign-in screen needs no second request); `app` is everything else and comes with the
 * application. The other language is fetched only when somebody asks for it.
 */
export function loadAccess(lang: Lang): Promise<Catalogue> {
  if (lang === 'fr') return Promise.resolve(frAccess);
  return import('./messages/en/access.ts').then((module) => module.access);
}

export function loadApp(lang: Lang): Promise<Catalogue> {
  return lang === 'fr' ? import('./messages/fr/app.ts').then((module) => module.app) : import('./messages/en/app.ts').then((module) => module.app);
}

export const FRENCH_ACCESS: Catalogue = frAccess;

import type { Lang } from '../../../shared/i18n/lang.ts';

/**
 * Translating on the person's own device, with the browser's built-in translator (Chrome on a computer). Used
 * only when the server has no translation service: nothing leaves the machine, and nothing is configured.
 * The first use of a language pair downloads a model, which the browser only allows after a click.
 */

interface Translator {
  translate: (text: string) => Promise<string>;
}

interface TranslatorFactory {
  availability: (options: { sourceLanguage: string; targetLanguage: string }) => Promise<'unavailable' | 'downloadable' | 'downloading' | 'available'>;
  create: (options: { sourceLanguage: string; targetLanguage: string; monitor?: (monitor: EventTarget) => void }) => Promise<Translator>;
}

/** The language Kitsu writes its texts in. */
const SOURCE_LANGUAGE = 'en';

export type DeviceAvailability = 'ready' | 'needs-click' | 'none';

function factory(): TranslatorFactory | null {
  return (globalThis as { Translator?: TranslatorFactory }).Translator ?? null;
}

export async function deviceAvailability(target: Lang): Promise<DeviceAvailability> {
  const translators = factory();
  if (!translators || target === SOURCE_LANGUAGE) return 'none';
  try {
    const state = await translators.availability({ sourceLanguage: SOURCE_LANGUAGE, targetLanguage: target });
    if (state === 'available') return 'ready';
    return state === 'unavailable' ? 'none' : 'needs-click';
  } catch {
    return 'none';
  }
}

const done = new Map<string, string>();

/** `onProgress` gets 0 to 1 while the browser downloads its model. Rejects when the browser cannot do it. */
export async function translateOnDevice(text: string, target: Lang, onProgress?: (fraction: number) => void): Promise<string> {
  const known = done.get(`${target}:${text}`);
  if (known !== undefined) return known;
  const translators = factory();
  if (!translators) throw new Error('no device translator');
  const translator = await translators.create({
    sourceLanguage: SOURCE_LANGUAGE,
    targetLanguage: target,
    monitor: (monitor) => monitor.addEventListener('downloadprogress', (event) => onProgress?.((event as Event & { loaded: number }).loaded)),
  });
  const translated = await translator.translate(text);
  done.set(`${target}:${text}`, translated);
  return translated;
}

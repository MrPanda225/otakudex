import { useCallback, useEffect, useState } from 'preact/hooks';
import type { EntryDto } from '../../../shared/domain.ts';
import { api } from '../api.ts';
import { useI18n } from '../i18n/index.tsx';
import { deviceAvailability, translateOnDevice } from './device-translation.ts';

/**
 * What the sheet shows for a synopsis, in the language of the screen (FR-108, FR-109): the server's translation
 * when it has one, else the browser's own translator, else the original. The original is always shown while a
 * translation is awaited: the text never blinks out.
 */
export interface SynopsisView {
  text: string | null;
  note: 'translated' | 'untranslated' | 'translating' | null;
  /** The browser can translate once the person agrees (it has to download a model first). */
  canTranslateHere: boolean;
  /** 0 to 1 while that model downloads, else null. */
  progress: number | null;
  translateHere: () => void;
}

type Settled = { text: string; note: 'translated' | 'untranslated'; canTranslateHere: boolean };

const settled = new Map<string, Settled>();

export function useSynopsis(entry: EntryDto): SynopsisView {
  const { lang } = useI18n();
  const original = entry.media.synopsis?.trim() || null;
  const key = `${entry.id}:${lang}:${original ?? ''}`; // the text itself: an entry whose synopsis changed is asked again
  const [answer, setAnswer] = useState<{ key: string; value: Settled } | null>(() => {
    const known = settled.get(key);
    return known ? { key, value: known } : null;
  });
  const [progress, setProgress] = useState<number | null>(null);

  useEffect(() => {
    if (!original || lang === 'en' || settled.has(key)) return;
    let isStale = false;
    const remember = (value: Settled) => {
      settled.set(key, value);
      if (!isStale) setAnswer({ key, value });
    };
    void (async () => {
      let served: { text: string | null; status: string } | null = null;
      try {
        served = await api.synopsis(entry.id, lang);
      } catch {
        served = null; // the server could not say: fall back to the device, then to the original
      }
      if (served?.status === 'translated' && served.text) return remember({ text: served.text, note: 'translated', canTranslateHere: false });
      const here = await deviceAvailability(lang);
      if (here === 'ready') {
        try {
          return remember({ text: await translateOnDevice(original, lang), note: 'translated', canTranslateHere: false });
        } catch {
          // fall through to the original
        }
      }
      remember({ text: original, note: 'untranslated', canTranslateHere: here === 'needs-click' });
    })();
    return () => {
      isStale = true;
    };
  }, [key, entry.id, lang, original]);

  const translateHere = useCallback(() => {
    if (!original) return;
    setProgress(0);
    translateOnDevice(original, lang, setProgress)
      .then((text) => {
        const value: Settled = { text, note: 'translated', canTranslateHere: false };
        settled.set(key, value);
        setAnswer({ key, value });
      })
      .catch(() => undefined) // the browser said no: the original stays, the offer stays
      .finally(() => setProgress(null));
  }, [key, lang, original]);

  if (!original) return { text: null, note: null, canTranslateHere: false, progress: null, translateHere };
  if (lang === 'en') return { text: original, note: null, canTranslateHere: false, progress: null, translateHere };
  const current = answer?.key === key ? answer.value : null;
  if (!current) return { text: original, note: 'translating', canTranslateHere: false, progress: null, translateHere };
  return { text: current.text, note: current.note, canTranslateHere: current.canTranslateHere, progress, translateHere };
}

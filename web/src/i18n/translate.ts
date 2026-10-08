import { fillMessage, lookupMessage, type MessageParams } from '../../../shared/i18n/format.ts';
import type { Lang } from '../../../shared/i18n/lang.ts';
import type { Catalogue, MessageKey } from './catalogue.ts';

export type Translate = (key: MessageKey, params?: MessageParams) => string;

/**
 * `t` for one language: finds the text, picks the plural form from `params.count`, fills the `{holes}`.
 * A key with no text shows as itself (and is reported to `onMissing`): a gap is visible, never a blank.
 */
export function createTranslate(lang: Lang, messages: Catalogue, onMissing?: (key: string) => void): Translate {
  return (key, params) => {
    const text = lookupMessage(messages, key, lang, params);
    if (text === undefined) {
      onMissing?.(key);
      return key;
    }
    return fillMessage(text, params, lang);
  };
}

import { useMemo } from 'preact/hooks';
import { createFormat, type Format } from './format.ts';
import { useI18n } from './index.tsx';

/** The formatters of the language on screen; new ones are made only when the language changes. */
export function useFormat(): Format {
  const { lang, t } = useI18n();
  return useMemo(() => createFormat(lang, t), [lang, t]);
}

import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { EntryDto } from '../../../../shared/domain.ts';
import { useI18n } from '../../i18n/index.tsx';
import { useSynopsis } from '../../lib/synopsis.ts';

/**
 * Three lines of the synopsis in the language of the screen, and "Read more" only when there is more to read.
 * A quiet line says when the text was translated by a machine, or is still in English.
 */
export function Synopsis({ entry }: { entry: EntryDto }) {
  const { t } = useI18n();
  const { text, note, canTranslateHere, progress, translateHere } = useSynopsis(entry);
  const paragraph = useRef<HTMLParagraphElement>(null);
  const [isExpanded, setExpanded] = useState(false);
  const [isTruncated, setTruncated] = useState(false);

  useLayoutEffect(() => {
    const element = paragraph.current;
    if (!element) return;
    const measure = () => {
      if (!isExpanded) setTruncated(element.scrollHeight > element.clientHeight + 1);
    };
    measure();
    void document.fonts?.ready.then(measure); // the web font changes the line breaks
  }, [text, isExpanded]);

  if (text === null) return null;
  return (
    <div class="synopsis-block">
      <p ref={paragraph} class={`text-sm synopsis-text${isExpanded ? '' : ' is-clamped'}`}>{text}</p>
      {isTruncated || isExpanded ? (
        <button type="button" class="link-btn" aria-expanded={isExpanded} onClick={() => setExpanded(!isExpanded)}>
          {t(isExpanded ? 'synopsis.less' : 'synopsis.more')}
        </button>
      ) : null}
      {canTranslateHere && progress === null ? (
        <button type="button" class="link-btn" onClick={translateHere}>{t('synopsis.translateButton')}</button>
      ) : null}
      {progress !== null ? <p class="field-hint" role="status">{t('synopsis.preparing', { percent: Math.round(progress * 100) })}</p> : null}
      {note !== null && progress === null ? <p class="field-hint">{t(NOTE_KEY[note])}</p> : null}
    </div>
  );
}

const NOTE_KEY = {
  translated: 'synopsis.translated',
  untranslated: 'synopsis.untranslated',
  translating: 'synopsis.translating',
} as const;

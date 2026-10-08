import { useCallback, useEffect, useId, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../i18n/index.tsx';
import { SavedFlag } from './SavedFlag.tsx';

const IDLE_BEFORE_SAVE_MS = 600;
const MAX_NOTE_LENGTH = 5_000;

interface NoteFieldProps {
  note: string | null;
  /** Resolves to false when the save failed, so the same text is tried again later. */
  onSave: (note: string | null) => Promise<boolean>;
  savedStamp: number;
}

/**
 * The private note saves by itself: a moment after the last key, when the field is left, and when the
 * sheet closes. Whatever was typed is never lost to Escape or a click outside.
 */
export function NoteField({ note, onSave, savedStamp }: NoteFieldProps) {
  const { t } = useI18n();
  const id = useId();
  const [text, setText] = useState(note ?? '');
  const latest = useRef(text);
  const lastSaved = useRef((note ?? '').trim());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    const value = latest.current.trim();
    if (value === lastSaved.current) return;
    const previous = lastSaved.current;
    lastSaved.current = value;
    void onSaveRef.current(value === '' ? null : value).then((isSaved) => {
      if (!isSaved && lastSaved.current === value) lastSaved.current = previous;
    });
  }, []);

  useEffect(() => flush, [flush]); // closing the sheet saves what is pending

  return (
    <div class="field">
      <div class="field-head">
        <label for={id}>{t('note.label')}</label>
        <SavedFlag stamp={savedStamp} />
      </div>
      <textarea
        id={id}
        class="textarea"
        maxLength={MAX_NOTE_LENGTH}
        value={text}
        onInput={(event) => {
          latest.current = event.currentTarget.value;
          setText(event.currentTarget.value);
          clearTimeout(timer.current);
          timer.current = setTimeout(flush, IDLE_BEFORE_SAVE_MS);
        }}
        onBlur={flush}
      />
      <p class="field-hint">{t('note.hint')}</p>
    </div>
  );
}

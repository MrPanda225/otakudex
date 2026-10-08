import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { useI18n } from '../../i18n/index.tsx';
import { problemText, type Problem } from '../../i18n/problem.ts';
import { caretAfterDigits } from '../../lib/dates.ts';
import { Icon } from '../Icon.tsx';
import { SavedFlag } from './SavedFlag.tsx';

export type Parsed<Value> = { ok: true; value: Value } | { ok: false; problem: Problem };

interface CommitFieldProps<Value> {
  label: string;
  value: Value;
  toText: (value: Value) => string;
  /** Reads what was typed and checks it. A problem is shown under the field and nothing is saved. */
  parse: (text: string) => Parsed<Value>;
  onCommit: (value: Value) => void;
  /** Shapes the text while typing (slashes in a date). */
  mask?: (raw: string) => string;
  placeholder?: string;
  maxLength?: number;
  hint?: string;
  /** A shortcut that fills the field in one tap ("Today"). */
  quickFill?: { label: string; value: () => Value };
  savedStamp: number;
}

/**
 * A text field that saves when the user is done (leaves the field, or presses Enter), not on every
 * key: mistakes are reported once, under the field, with a way out. A value changed elsewhere (the
 * server filling in a date) shows up here too, unless the user is typing in the field.
 */
export function CommitField<Value>({ label, value, toText, parse, onCommit, mask, placeholder, maxLength, hint, quickFill, savedStamp }: CommitFieldProps<Value>) {
  const { t } = useI18n();
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(() => toText(value));
  const [error, setError] = useState<Problem | null>(null);
  const committed = useRef(value);

  useEffect(() => {
    committed.current = value;
    if (document.activeElement !== input.current && error === null) setText(toText(value));
  }, [value]);

  function commit(raw: string): boolean {
    const result = parse(raw);
    if (!result.ok) {
      setError(result.problem);
      return false;
    }
    setError(null);
    setText(toText(result.value));
    if (result.value !== committed.current) {
      committed.current = result.value;
      onCommit(result.value);
    }
    return true;
  }

  const messageId = `${id}-message`;
  return (
    <div class="field">
      <div class="field-head">
        <label for={id}>{label}</label>
        <SavedFlag stamp={savedStamp} />
      </div>
      <div class="field-control">
        <input
          ref={input}
          id={id}
          class="input"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder={placeholder}
          maxLength={maxLength}
          value={text}
          aria-invalid={error !== null}
          aria-describedby={error !== null || hint ? messageId : undefined}
          onInput={(event) => {
            const field = event.currentTarget;
            let next = field.value;
            if (mask) {
              const digitsBefore = field.value.slice(0, field.selectionStart ?? field.value.length).replace(/\D/g, '').length;
              next = mask(field.value);
              field.value = next;
              const caret = caretAfterDigits(next, digitsBefore);
              field.setSelectionRange(caret, caret);
            }
            setText(next);
            if (error !== null) setError(null);
          }}
          onBlur={() => commit(text)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            if (commit(text)) input.current?.blur();
          }}
        />
        {quickFill ? (
          <button type="button" class="btn btn--small" onClick={() => commit(toText(quickFill.value()))}>
            {quickFill.label}
          </button>
        ) : null}
      </div>
      {error !== null ? (
        <p id={messageId} class="field-error" role="alert">
          <Icon name="alert" />
          {problemText(t, error)}
        </p>
      ) : hint ? (
        <p id={messageId} class="field-hint">{hint}</p>
      ) : null}
    </div>
  );
}

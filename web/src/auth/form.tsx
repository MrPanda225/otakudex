import { useId, useRef, useState } from 'preact/hooks';
import { errorMessage } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { problemText, type Problem } from '../i18n/problem.ts';

/** One input of an access form: its text, its message, and a check that runs when the person leaves it. */
export interface Field {
  value: string;
  error: Problem | null;
  ref: { current: HTMLInputElement | null };
  setValue: (value: string) => void;
  /** A message of the interface (it follows the language) or the server's own words. */
  setError: (problem: Problem | null) => void;
  /** Checks the field now, shows its message, and says whether it is fine. */
  validate: () => boolean;
  focus: () => void;
}

/** `check` returns the problem to show, or null when the text is fine. */
export function useField(check: (value: string) => Problem | null, initial = ''): Field {
  const [value, setValueState] = useState(initial);
  const [error, setError] = useState<Problem | null>(null);
  const ref = useRef<HTMLInputElement | null>(null);
  return {
    value,
    error,
    ref,
    setValue: (next) => {
      setValueState(next);
      setError(null); // the message is about what was typed before; it goes away as soon as the text changes
    },
    setError,
    validate: () => {
      const problem = check(value);
      setError(problem);
      return problem === null;
    },
    focus: () => ref.current?.focus(),
  };
}

/** Checks every field (so all messages show at once) and puts the focus on the first one that failed. */
export function validateAll(fields: readonly Field[]): boolean {
  const results = fields.map((field) => field.validate());
  const firstInvalid = fields.find((_, index) => !results[index]);
  firstInvalid?.focus();
  return firstInvalid === undefined;
}

interface TextFieldProps {
  label: MessageKey;
  field: Field;
  /** The `autocomplete` token: password managers and keyboards rely on it. */
  autoComplete: 'name' | 'username' | 'current-password' | 'new-password' | 'off';
  type?: 'text' | 'email' | 'password';
  inputMode?: 'email' | 'text';
  hint?: { key: MessageKey; params?: Record<string, string | number> };
}

/** A labelled input. Passwords get a "show" button instead of a second "confirm" field (NFR-49). */
export function TextField({ label, field, autoComplete, type = 'text', inputMode, hint }: TextFieldProps) {
  const { t } = useI18n();
  const id = useId();
  const messageId = `${id}-message`;
  const [isRevealed, setRevealed] = useState(false);
  const isPassword = type === 'password';

  const input = (
    <input
      id={id}
      ref={field.ref}
      class="input"
      // Preact types `type` as two disjoint families of values; the three used here all behave as text inputs.
      type={(isPassword && isRevealed ? 'text' : type) as 'text'}
      name={autoComplete === 'username' ? 'email' : autoComplete}
      autoComplete={autoComplete}
      inputMode={inputMode}
      autoCapitalize="off"
      autoCorrect="off"
      spellcheck={false}
      value={field.value}
      aria-invalid={field.error !== null}
      aria-describedby={field.error !== null || hint ? messageId : undefined}
      onInput={(event) => field.setValue(event.currentTarget.value)}
      onBlur={() => {
        if (field.value !== '' || field.error !== null) field.validate();
      }}
    />
  );

  return (
    <div class="field">
      <label for={id}>{t(label)}</label>
      {isPassword ? (
        <div class="password-control">
          {input}
          <button
            type="button"
            class="password-toggle"
            aria-pressed={isRevealed}
            aria-label={t(isRevealed ? 'field.hidePassword' : 'field.showPassword')}
            // Keep the focus in the field: clicking "show" must not count as leaving it.
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setRevealed(!isRevealed)}
          >
            <Icon name={isRevealed ? 'eye-off' : 'eye'} />
          </button>
        </div>
      ) : (
        input
      )}
      {field.error !== null ? (
        <p id={messageId} class="field-error" role="alert">
          <Icon name="alert" />
          {problemText(t, field.error)}
        </p>
      ) : hint ? (
        <p id={messageId} class="field-hint">{t(hint.key, hint.params)}</p>
      ) : null}
    </div>
  );
}

/** A message about the whole form (wrong password, too many attempts, server unreachable). */
export function FormError({ message }: { message: string | null }) {
  if (message === null) return null;
  return (
    <div class="notice notice--error" role="alert">
      <Icon name="alert" />
      <p>{message}</p>
    </div>
  );
}

export function SubmitButton({ label, isPending }: { label: MessageKey; isPending: boolean }) {
  const { t } = useI18n();
  // Not `disabled`: a disabled button drops the focus. The class blocks clicks and shows the spinner; submit() ignores repeats.
  return (
    <button type="submit" class={`btn btn--primary btn--wide${isPending ? ' is-loading' : ''}`} aria-busy={isPending}>
      {t(label)}
    </button>
  );
}

/** Runs the action of a form once at a time, and keeps its error message. */
export function useSubmit() {
  const [isPending, setPending] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function run(action: () => Promise<void>, explain?: (error: unknown) => boolean): Promise<void> {
    if (isPending) return;
    setPending(true);
    setFormError(null);
    try {
      await action();
    } catch (error) {
      const isExplained = explain?.(error) ?? false; // the message went to the field it is about
      if (!isExplained) setFormError(errorMessage(error));
    } finally {
      setPending(false);
    }
  }
  return { isPending, formError, run };
}

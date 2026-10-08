import { useId } from 'preact/hooks';
import { useI18n } from '../../i18n/index.tsx';
import { Icon } from '../Icon.tsx';
import { SavedFlag } from './SavedFlag.tsx';

interface StepperProps {
  label: string;
  value: number;
  min?: number;
  max?: number;
  hint?: string;
  onChange: (value: number) => void;
  savedStamp: number;
}

/** A small count the user nudges up or down (rewatches): two large buttons around the value. */
export function Stepper({ label, value, min = 0, max = 1_000, hint, onChange, savedStamp }: StepperProps) {
  const id = useId();
  const { t } = useI18n();
  return (
    <div class="field" role="group" aria-labelledby={`${id}-label`}>
      <div class="field-head">
        <span class="label" id={`${id}-label`}>{label}</span>
        <SavedFlag stamp={savedStamp} />
      </div>
      <div class="stepper">
        <button type="button" class="icon-btn" aria-label={t('stepper.less', { label })} disabled={value <= min} onClick={() => onChange(value - 1)}>
          <Icon name="minus" />
        </button>
        <output class="stepper-value" aria-live="polite">{value}</output>
        <button type="button" class="icon-btn" aria-label={t('stepper.more', { label })} disabled={value >= max} onClick={() => onChange(value + 1)}>
          <Icon name="plus" />
        </button>
      </div>
      {hint ? <p class="field-hint">{hint}</p> : null}
    </div>
  );
}

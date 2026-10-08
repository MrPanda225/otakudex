import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { STATUSES, type EntryDto, type Status } from '../../../../shared/domain.ts';
import { statusLabel } from '../../../../shared/labels.ts';
import { useI18n } from '../../i18n/index.tsx';
import { useSlidingIndicator } from '../../motion/hooks.ts';
import { springIn } from '../../motion/motion.ts';
import { Icon } from '../Icon.tsx';
import { SavedFlag } from './SavedFlag.tsx';

interface StatusChoiceProps {
  entry: EntryDto;
  onChoose: (status: Status) => void;
  savedStamp: number;
}

/**
 * The five statuses as visible choices (native radio buttons: arrow keys work, a screen reader says
 * "2 of 5"). Going back to "to watch" would drop the entry's rank, so that one asks first.
 */
export function StatusChoice({ entry, onChoose, savedStamp }: StatusChoiceProps) {
  const { t, lang } = useI18n();
  const groupName = useId();
  const { containerRef, indicatorRef } = useSlidingIndicator<HTMLDivElement>(entry.status);
  const [isConfirming, setConfirming] = useState(false);
  const notice = useRef<HTMLDivElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isConfirming) return;
    springIn(notice.current);
    keepButton.current?.focus(); // the safe answer gets the focus
  }, [isConfirming]);

  function choose(status: Status) {
    if (status === entry.status) return;
    if (status === 'planned' && entry.rankPosition !== null) {
      setConfirming(true);
      return;
    }
    setConfirming(false);
    onChoose(status);
  }

  function keepStatus() {
    setConfirming(false);
    document.getElementById(`${groupName}-${entry.status}`)?.focus();
  }

  return (
    <fieldset class="choice-field">
      <legend>
        {t('status.legend')}
        <SavedFlag stamp={savedStamp} />
      </legend>
      <div class="choices" ref={containerRef}>
        <span class="indicator" ref={indicatorRef} aria-hidden="true" />
        {STATUSES.map((status) => (
          <label key={status} class="tab choice" data-active={entry.status === status ? 'true' : 'false'}>
            <input
              id={`${groupName}-${status}`}
              class="choice-input"
              type="radio"
              name={groupName}
              value={status}
              checked={entry.status === status}
              onChange={() => choose(status)}
            />
            {statusLabel(lang, status)}
          </label>
        ))}
      </div>
      {isConfirming ? (
        <div class="notice notice--error" role="alert" ref={notice}>
          <Icon name="alert" />
          <div class="notice-body">
            <p>{t('status.confirmText', { planned: statusLabel(lang, 'planned'), rank: entry.rankPosition ?? 0 })}</p>
            <div class="notice-actions">
              <button type="button" class="btn btn--danger btn--small" onClick={() => { setConfirming(false); onChoose('planned'); }}>
                {t('status.confirmYes', { planned: statusLabel(lang, 'planned') })}
              </button>
              <button type="button" class="btn btn--small" ref={keepButton} onClick={keepStatus}>
                {t('status.keep', { status: statusLabel(lang, entry.status) })}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </fieldset>
  );
}

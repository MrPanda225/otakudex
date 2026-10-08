import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { springIn } from '../motion/motion.ts';
import { Icon, type IconName } from './Icon.tsx';

interface InlineConfirmProps {
  triggerLabel: string;
  triggerIcon?: IconName;
  /** Classes of the button that starts the action. */
  triggerClass?: string;
  /** What will happen, and what will be lost. */
  message: ComponentChildren;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

/**
 * An action that asks first, right where the button was, without a pop-up in the way. The safe answer
 * takes the focus, and gets it back on the button when the person changes their mind.
 */
export function InlineConfirm({ triggerLabel, triggerIcon, triggerClass = 'btn btn--quiet', message, confirmLabel, cancelLabel, onConfirm }: InlineConfirmProps) {
  const [isConfirming, setConfirming] = useState(false);
  const notice = useRef<HTMLDivElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const triggerButton = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => {
    if (isConfirming) {
      springIn(notice.current);
      cancelButton.current?.focus();
    } else if (wasConfirming.current) {
      triggerButton.current?.focus();
    }
    wasConfirming.current = isConfirming;
  }, [isConfirming]);

  if (!isConfirming) {
    return (
      <button type="button" class={triggerClass} ref={triggerButton} onClick={() => setConfirming(true)}>
        {triggerIcon ? <Icon name={triggerIcon} /> : null}
        {triggerLabel}
      </button>
    );
  }
  return (
    <div class="notice notice--error" role="alert" ref={notice}>
      <Icon name="alert" />
      <div class="notice-body">
        <p>{message}</p>
        <div class="notice-actions">
          <button type="button" class="btn btn--danger btn--small" onClick={onConfirm}>
            {confirmLabel}
          </button>
          <button type="button" class="btn btn--small" ref={cancelButton} onClick={() => setConfirming(false)}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

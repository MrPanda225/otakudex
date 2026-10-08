import type { ComponentChildren } from 'preact';
import { useI18n } from '../i18n/index.tsx';
import { useEffect, useId, useRef, useState } from 'preact/hooks';
import { dialogIn, dialogOut } from '../motion/motion.ts';
import { Icon } from './Icon.tsx';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  /** "sheet" slides in from the right (details); the default is a centred dialog. */
  variant?: 'sheet';
  footer?: ComponentChildren;
  children: ComponentChildren;
}

/**
 * Native <dialog>: the browser handles focus trapping and the backdrop. Opening and closing are
 * animated; while it leaves, the dialog keeps showing what it last showed, so nothing vanishes
 * before the animation ends. Children are only mounted while it is open or leaving, so each
 * opening starts from a clean state.
 */
export function Modal({ isOpen, onClose, title, variant, footer, children }: ModalProps) {
  const { t } = useI18n();
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const isSheet = variant === 'sheet';
  const [isRendered, setRendered] = useState(isOpen);
  const lastChildren = useRef(children);
  const lastFooter = useRef(footer);
  const lastTitle = useRef(title);
  const isOpenRef = useRef(isOpen);
  isOpenRef.current = isOpen;
  if (isOpen) {
    lastChildren.current = children;
    lastFooter.current = footer;
    lastTitle.current = title;
  }

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (isOpen) {
      setRendered(true);
      if (!element.open) {
        element.showModal();
        dialogIn(element, isSheet);
      }
    } else if (element.open) {
      dialogOut(element, isSheet, () => {
        if (isOpenRef.current) return; // reopened while it was leaving: stay open
        element.close();
        setRendered(false);
      });
    }
  }, [isOpen, isSheet]);

  return (
    <dialog
      ref={dialog}
      class={isSheet ? 'sheet' : undefined}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape asks to close: let the owner decide, so the exit can be animated.
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      onClick={(event) => {
        // A click that lands on the <dialog> itself, not on its content, is a click on the backdrop.
        if (event.target === dialog.current) onClose();
      }}
    >
      {isRendered ? (
        <>
          <div class="dialog-head">
            <h2 id={titleId}>{lastTitle.current}</h2>
            <button type="button" class="icon-btn" aria-label={t('common.close')} onClick={onClose}>
              <Icon name="close" />
            </button>
          </div>
          <div class="dialog-body">{lastChildren.current}</div>
          {lastFooter.current ? <div class="dialog-foot">{lastFooter.current}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}

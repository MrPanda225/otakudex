import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useMemo, useRef, useState } from 'preact/hooks';

const TOAST_DURATION_MS = 5_000;
const EXIT_ANIMATION_MS = 160; // same as the CSS keyframes of .toast.is-leaving
const MAX_VISIBLE_TOASTS = 3;

interface ToastOptions {
  tone?: 'info' | 'error';
  actionLabel?: string;
  onAction?: () => void;
}

interface Toast extends ToastOptions {
  id: number;
  message: string;
  isLeaving: boolean;
}

type Notify = (message: string, options?: ToastOptions) => void;

const ToastContext = createContext<Notify | null>(null);

export function ToastProvider({ children }: { children: ComponentChildren }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const region = useRef<HTMLDivElement>(null);

  const dismiss = useCallback((id: number) => {
    // First let the toast play its exit, then remove it.
    setToasts((current) => current.map((toast) => (toast.id === id ? { ...toast, isLeaving: true } : toast)));
    setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), EXIT_ANIMATION_MS + 20);
  }, []);

  const notify = useCallback<Notify>(
    (message, options = {}) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-(MAX_VISIBLE_TOASTS - 1)), { id, message, isLeaving: false, ...options }]);
      setTimeout(() => dismiss(id), TOAST_DURATION_MS);
      // Re-opening the popover moves it back above any dialog opened since.
      const element = region.current;
      if (element?.showPopover) {
        if (element.matches(':popover-open')) element.hidePopover();
        element.showPopover();
      }
    },
    [dismiss],
  );

  const value = useMemo(() => notify, [notify]);
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div class="toast-region" popover="manual" ref={region} role="status" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  // Its entrance and exit are CSS keyframes (app.css): the notifications live in the first file the browser
  // loads, and anime.js belongs to the application file.
  return (
    <div class={`toast${toast.tone === 'error' ? ' toast--error' : ''}${toast.isLeaving ? ' is-leaving' : ''}`}>
      <span>{toast.message}</span>
      {toast.actionLabel && toast.onAction ? (
        <button
          type="button"
          onClick={() => {
            toast.onAction?.();
            onDismiss(toast.id);
          }}
        >
          {toast.actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function useToast(): Notify {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

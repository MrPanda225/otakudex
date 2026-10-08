const WATCH_MS = 1500;

/**
 * After a change of page, keyboard focus should land on the page title so assistive technology
 * announces where the user is. The title can be replaced while the page loads (placeholder, then
 * content), which drops focus back on the body: for a short time, focus is moved onto each new title.
 * It stops at once if the user starts interacting. Returns a function that stops the watch.
 */
export function focusPageTitle(container: HTMLElement): () => void {
  let focused: HTMLElement | null = null;

  const placeFocus = () => {
    const title = container.querySelector<HTMLElement>('[data-page-title]');
    if (!title || title === focused) return;
    const hasLostFocus = focused === null || document.activeElement === document.body || document.activeElement === focused;
    if (!hasLostFocus) return;
    focused = title;
    title.focus({ preventScroll: true });
  };

  placeFocus();
  const observer = new MutationObserver(placeFocus);
  observer.observe(container, { childList: true, subtree: true });

  const stop = () => {
    observer.disconnect();
    window.clearTimeout(timer);
    window.removeEventListener('pointerdown', stop, true);
    window.removeEventListener('keydown', stop, true);
  };
  const timer = window.setTimeout(stop, WATCH_MS);
  window.addEventListener('pointerdown', stop, true);
  window.addEventListener('keydown', stop, true);
  return stop;
}

import { animate, spring, stagger, utils, type AnimationParams, type JSAnimation } from 'animejs';
import { prefersReducedMotion } from '../lib/hooks.ts';

/**
 * Every animation of the app goes through this module, so the rules of docs/05-refonte-ux-animations.md
 * hold in one place: short durations, transform and opacity only, no motion when the user asked for
 * none, and no leftover inline styles (a leftover `transform` would silence CSS hover effects).
 */

export const DURATION_MS = { micro: 220, enter: 280, exit: 160, sequence: 380, reward: 700 } as const;
export const EASE = { enter: 'outExpo', exit: 'inQuad', soft: 'outQuad' } as const;

const STAGGER_STEP_MS = 30;
const MAX_STAGGER_TOTAL_MS = 360;
const MAX_STAGGERED_ITEMS = 30;

export type MotionTargets = Element | Iterable<Element> | null | undefined;

function elementsOf(targets: MotionTargets): HTMLElement[] {
  if (!targets) return [];
  const list = targets instanceof Element ? [targets] : [...targets];
  return list.filter((element): element is HTMLElement => element instanceof HTMLElement || element instanceof SVGElement) as HTMLElement[];
}

interface PlayOptions {
  /**
   * Leave the animated values in place once it ends. Needed when the view library owns the final
   * value (the fill of a progress bar): the animation then only travels towards it.
   */
  keepFinalStyle?: boolean;
}

/** The inline properties our animations write. They are cleared at the end so the stylesheet rules apply again. */
function clearAnimatedStyles(elements: readonly HTMLElement[]): void {
  for (const element of elements) {
    element.style.removeProperty('opacity');
    element.style.removeProperty('transform');
  }
}

const HIDDEN_SAFETY_MS = 2500;

/**
 * Sets the starting state of an entrance (hidden, shrunk) before the first frame. A safety timer
 * clears it later in any case, so a failed animation can never leave something invisible for good.
 */
function startFrom(elements: HTMLElement | HTMLElement[], properties: Record<string, number>): void {
  utils.set(elements, properties);
  const list = Array.isArray(elements) ? elements : [elements];
  window.setTimeout(() => clearAnimatedStyles(list), HIDDEN_SAFETY_MS);
}

/**
 * Plays an animation and, once it ends, takes back the inline styles it wrote, so the element goes
 * back to what the stylesheet says (a leftover `transform` would silence CSS hover effects, and a
 * leftover `opacity: 0` would hide the element for good). Returns null (and touches nothing) when
 * motion is reduced or there is nothing to animate: callers never need a special case for the final state.
 */
export function play(targets: MotionTargets, params: AnimationParams, options: PlayOptions = {}): JSAnimation | null {
  const elements = elementsOf(targets);
  if (elements.length === 0 || prefersReducedMotion()) return null;
  const userOnComplete = params['onComplete'] as ((self: JSAnimation) => void) | undefined;
  return animate(elements, {
    ...params,
    onComplete: (self: JSAnimation) => {
      userOnComplete?.(self);
      if (options.keepFinalStyle) return;
      self.revert();
      clearAnimatedStyles(elements); // revert() restores what was there when the animation was created, possibly a hidden start state
    },
  });
}

/** Delay between items so that a whole sequence never lasts more than MAX_STAGGER_TOTAL_MS. */
function staggerDelay(count: number, from: 'first' | 'last' = 'first') {
  return stagger(Math.min(STAGGER_STEP_MS, MAX_STAGGER_TOTAL_MS / Math.max(count - 1, 1)), { from });
}

/** Items rise and fade in one after the other. Only the first MAX_STAGGERED_ITEMS move; the rest are simply there. */
export function staggerIn(targets: MotionTargets): void {
  const items = elementsOf(targets).slice(0, MAX_STAGGERED_ITEMS);
  if (items.length === 0 || prefersReducedMotion()) return;
  startFrom(items, { opacity: 0 }); // hide before the first frame: no flash of the final state
  play(items, { opacity: [0, 1], translateY: [12, 0], duration: DURATION_MS.enter, delay: staggerDelay(items.length), ease: EASE.enter });
}

/** A whole page block fades and slides in. */
export function enterPage(element: HTMLElement | null): void {
  if (!element || prefersReducedMotion()) return;
  startFrom(element, { opacity: 0 });
  play(element, { opacity: [0, 1], translateY: [10, 0], duration: DURATION_MS.enter, ease: EASE.enter });
}

/** A short elastic press, for the feedback of a tap or click. */
export function bump(element: HTMLElement | null): void {
  play(element, { scale: [1, 0.88, 1], duration: DURATION_MS.micro, ease: EASE.soft });
}

/** A small pulse for a thing that just completed. */
export function pulse(element: HTMLElement | null): void {
  play(element, { scale: [1, 1.04, 1], duration: DURATION_MS.sequence, ease: EASE.soft });
}

/** Arrival with a spring: used for results the user was waiting for. */
export function springIn(element: HTMLElement | null): void {
  if (!element || prefersReducedMotion()) return;
  startFrom(element, { opacity: 0 });
  play(element, { opacity: [0, 1], scale: [0.92, 1], translateY: [18, 0], ease: spring({ stiffness: 220, damping: 20 }) });
}

/** A tween of the horizontal scale of a bar between two ratios (0 to 1): progress without animating width. */
export function scaleBarX(element: HTMLElement | null, fromRatio: number, toRatio: number): void {
  play(element, { scaleX: [fromRatio, toRatio], duration: DURATION_MS.sequence, ease: EASE.enter }, { keepFinalStyle: true });
}

/** Bars of a chart grow from their baseline, one after the other. `axis` is the direction they grow along. */
export function growBars(targets: MotionTargets, axis: 'x' | 'y'): void {
  const bars = elementsOf(targets);
  if (bars.length === 0 || prefersReducedMotion()) return;
  const property = axis === 'x' ? 'scaleX' : 'scaleY';
  startFrom(bars, { [property]: 0 });
  play(bars, { [property]: [0, 1], duration: 500, delay: staggerDelay(bars.length), ease: EASE.enter });
}

/** Heatmap cells appear in a wave that starts from the most recent day. */
export function waveIn(targets: MotionTargets): void {
  const cells = elementsOf(targets);
  if (cells.length === 0 || prefersReducedMotion()) return;
  startFrom(cells, { opacity: 0 });
  play(cells, { opacity: [0, 1], duration: 240, delay: stagger(1.6, { from: 'last' }), ease: EASE.soft });
}

/** A confirmation that appears beside what was just saved. */
export function flagIn(element: HTMLElement | null): void {
  if (!element || prefersReducedMotion()) return;
  startFrom(element, { opacity: 0 });
  play(element, { opacity: [0, 1], translateX: [-6, 0], duration: DURATION_MS.micro, ease: EASE.enter });
}

/** Fades an element out, then calls `done` (at once when motion is reduced). The element stays hidden: `done` is expected to remove it. */
export function fadeOut(element: HTMLElement | null, done: () => void): void {
  if (!element || prefersReducedMotion()) {
    done();
    return;
  }
  play(element, { opacity: [1, 0], duration: DURATION_MS.exit, ease: EASE.exit, onComplete: done }, { keepFinalStyle: true });
}

/** A marker rises and fades away (the "+1" next to the button that was pressed). */
export function floatUp(element: HTMLElement | null, onDone: () => void): void {
  if (!element || prefersReducedMotion()) {
    onDone();
    return;
  }
  play(element, { translateY: [0, -28], opacity: [1, 0], duration: 600, ease: EASE.soft, onComplete: onDone });
}

/** A highlight laid over an element, fading away: shows where something changed. Needs `position: relative`. */
export function flash(element: HTMLElement | null): void {
  if (!element || prefersReducedMotion()) return;
  const overlay = document.createElement('span');
  overlay.className = 'flash-overlay';
  overlay.setAttribute('aria-hidden', 'true');
  element.appendChild(overlay);
  animate(overlay, { opacity: [0.5, 0], duration: 900, ease: EASE.soft, onComplete: () => overlay.remove() });
}

/**
 * Counts a number from `from` to `to`, writing it into `element` with `format`.
 * The element must not be managed by the view library (it would lose track of its text).
 * With reduced motion, or when nothing changes, the final value is written at once.
 */
export function countTo(element: HTMLElement, from: number, to: number, format: (value: number) => string, duration: number = DURATION_MS.reward): void {
  element.textContent = format(to);
  if (from === to || prefersReducedMotion()) return;
  const state = { value: from };
  element.textContent = format(from);
  animate(state, {
    value: to,
    duration,
    ease: EASE.enter,
    onUpdate: () => {
      element.textContent = format(state.value);
    },
    onComplete: () => {
      element.textContent = format(to);
    },
  });
}

/** The panel of a dialog: a short rise, or a slide for the side sheet. */
export function dialogIn(element: HTMLElement, isSheet: boolean): void {
  if (prefersReducedMotion()) return;
  startFrom(element, { opacity: 0 });
  play(
    element,
    isSheet
      ? { opacity: [0, 1], translateX: [48, 0], duration: DURATION_MS.enter, ease: EASE.enter }
      : { opacity: [0, 1], translateY: [24, 0], scale: [0.97, 1], duration: DURATION_MS.enter, ease: EASE.enter },
  );
}

/** Closing is quicker than opening. Calls `done` when finished (at once if motion is reduced). */
export function dialogOut(element: HTMLElement, isSheet: boolean, done: () => void): void {
  if (prefersReducedMotion()) {
    done();
    return;
  }
  play(element, {
    opacity: [1, 0],
    ...(isSheet ? { translateX: [0, 32] } : { translateY: [0, 12] }),
    duration: DURATION_MS.exit,
    ease: EASE.exit,
    onComplete: done,
  });
}

/**
 * Moves a highlight from where it was to where it is now without ever animating width or position:
 * the new box is applied at once, then the old one is replayed as a transform that shrinks to nothing.
 */
export function moveIndicator(indicator: HTMLElement, target: HTMLElement, container: HTMLElement, withMotion = true): void {
  const before = indicator.getBoundingClientRect();
  const wasVisible = indicator.dataset['ready'] === 'true';
  indicator.style.left = `${target.offsetLeft}px`;
  indicator.style.top = `${target.offsetTop}px`;
  indicator.style.width = `${target.offsetWidth}px`;
  indicator.style.height = `${target.offsetHeight}px`;
  indicator.dataset['ready'] = 'true';
  if (!withMotion || !wasVisible || container.offsetParent === null) return;
  const after = indicator.getBoundingClientRect();
  play(indicator, {
    translateX: [before.left - after.left, 0],
    translateY: [before.top - after.top, 0],
    scaleX: [before.width / after.width, 1],
    duration: 280,
    ease: EASE.enter,
  });
}

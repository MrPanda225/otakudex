import { useLayoutEffect, useRef } from 'preact/hooks';
import { countTo } from '../motion/motion.ts';

interface CountUpProps {
  value: number;
  /** How the number is written; receives fractional values while counting. */
  format?: (value: number) => string;
  /** Where the first count starts. Zero by default; pass the value itself to show it still and only count later changes. */
  from?: number;
}

const writeInteger = (value: number) => String(Math.round(value));

/**
 * A number that counts up to its value. It renders no children: the text belongs to the animation,
 * so the view library never fights it over the same text node.
 */
export function CountUp({ value, format = writeInteger, from = 0 }: CountUpProps) {
  const element = useRef<HTMLSpanElement>(null);
  const previous = useRef(from);

  useLayoutEffect(() => {
    if (!element.current) return;
    countTo(element.current, previous.current, value, format);
    previous.current = value;
  }, [value]);

  return <span ref={element} />;
}

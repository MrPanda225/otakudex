/**
 * Lets at most `maxConcurrent` tasks run at once; the others wait their turn in arrival order.
 * Used to stay polite with third-party APIs.
 */
export function createLimiter(maxConcurrent: number): <T>(task: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: (() => void)[] = [];

  function releaseNext(): void {
    running -= 1;
    waiting.shift()?.();
  }

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (running >= maxConcurrent) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running += 1;
    try {
      return await task();
    } finally {
      releaseNext();
    }
  };
}

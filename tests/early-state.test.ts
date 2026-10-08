import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AuthStateDto } from '../shared/domain.ts';
import type { Lang } from '../shared/i18n/lang.ts';
import { startAuthStateRequest, takeEarlyAuthState } from '../web/src/auth/early-state.ts';

describe('the first "who is signed in?" question, asked at start-up (NFR-61)', () => {
  afterEach(() => {
    takeEarlyAuthState();
  });

  it('goes out at once, in the language of the page, and is handed over only once', async () => {
    const ask = vi.fn(async (_lang: Lang): Promise<AuthStateDto> => ({ phase: 'signed-out' }));

    startAuthStateRequest(ask, 'en');

    expect(ask).toHaveBeenCalledTimes(1);
    expect(ask).toHaveBeenCalledWith('en');
    await expect(takeEarlyAuthState()).resolves.toEqual({ phase: 'signed-out' });
    expect(takeEarlyAuthState()).toBeNull(); // a retry makes a new, ordinary request
  });

  it('leaves a failure to whoever takes the answer, and raises nothing on its own', async () => {
    startAuthStateRequest(async () => {
      throw new Error('network down');
    }, 'fr');
    await new Promise((resolve) => setTimeout(resolve, 0)); // the rejection happens with nobody listening yet

    await expect(takeEarlyAuthState()).rejects.toThrow('network down');
  });
});

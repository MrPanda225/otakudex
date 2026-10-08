import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { AccountUserDto } from '../../../shared/domain.ts';
import { api, errorMessage, onSessionExpired } from '../api.ts';
import { useI18n } from '../i18n/index.tsx';
import { forgetReturning, rememberReturning } from '../lib/returning.ts';
import { clearStatsCache } from '../stats-cache.ts';
import { useToast } from '../toast.tsx';
import { takeEarlyAuthState } from './early-state.ts';

type AuthPhase = 'loading' | 'unreachable' | 'setup' | 'signed-out' | 'signed-in';

interface AuthContextValue {
  phase: AuthPhase;
  user: AccountUserDto | null;
  /** How many anime already in the database the first account will take over. */
  legacyEntryCount: number;
  /** The server asks for its creation code before it accepts the first account. */
  needsSetupCode: boolean;
  /** Why the sign-in screen is showing, when it is more than "you are not signed in". */
  notice: 'expired' | null;
  problem: string | null;
  /** A sign-in, a first account, an invitation or a reset succeeded: the server has set the cookie. */
  accept: (user: AccountUserDto) => void;
  /** Resolves to false when the server could not close the session: the screen then stays as it is. */
  signOut: () => Promise<boolean>;
  retry: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** Everything the browser remembers about the person who just left: the next one must find none of it. */
function forgetPersonalState(): void {
  clearStatsCache();
  try {
    window.sessionStorage.clear();
  } catch {
    // storage blocked: nothing was kept there anyway
  }
}

/** Asks the server who is signed in, and keeps the answer: the application only shows itself when someone is. */
export function AuthProvider({ children }: { children: ComponentChildren }) {
  const [phase, setPhase] = useState<AuthPhase>('loading');
  const [user, setUser] = useState<AccountUserDto | null>(null);
  const [legacyEntryCount, setLegacyEntryCount] = useState(0);
  const [needsSetupCode, setNeedsSetupCode] = useState(false);
  const notify = useToast();
  const { t } = useI18n();
  const [notice, setNotice] = useState<'expired' | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  useEffect(() => {
    let isStale = false;
    setPhase('loading');
    // The first answer was asked for at start-up; if that attempt failed, one normal request replaces it
    // (it carries the page's own language for its error text, which the early one could not).
    const early = takeEarlyAuthState();
    (early ? early.catch(() => api.auth.state()) : api.auth.state())
      .then((state) => {
        if (isStale) return;
        setUser(state.phase === 'signed-in' ? state.user : null);
        setLegacyEntryCount(state.phase === 'setup' ? state.legacyEntryCount : 0);
        setNeedsSetupCode(state.phase === 'setup' && state.needsSetupCode);
        setPhase(state.phase);
      })
      .catch((error: unknown) => {
        if (isStale) return;
        setProblem(errorMessage(error));
        setPhase('unreachable');
      });
    return () => {
      isStale = true;
    };
  }, [attempt]);

  // The "returning" mark follows the phase: set while someone is signed in, dropped as soon as nobody is (NFR-61).
  useEffect(() => {
    if (phase === 'signed-in') rememberReturning();
    else if (phase === 'signed-out' || phase === 'setup') forgetReturning();
  }, [phase]);

  // Any answer "you are not signed in" from the rest of the application ends the session on screen too.
  useEffect(() => {
    onSessionExpired(() => {
      // Late answers to requests sent before a deliberate sign-out must not claim the session "expired".
      if (phaseRef.current !== 'signed-in') return;
      forgetPersonalState();
      setUser(null);
      setNotice('expired');
      setPhase('signed-out');
    });
    return () => onSessionExpired(null);
  }, []);

  const accept = useCallback((signedIn: AccountUserDto) => {
    setUser(signedIn);
    setNotice(null);
    setPhase('signed-in');
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      // The server still holds the session, and so does the cookie: showing the sign-in screen would be a lie,
      // and the next person on a shared computer would find this one still open after a reload.
      notify(t('signOut.failed', { reason: errorMessage(error) }), { tone: 'error' });
      return false;
    }
    forgetPersonalState();
    setUser(null);
    setNotice(null);
    setPhase('signed-out');
    return true;
  }, [notify, t]);

  const retry = useCallback(() => setAttempt((current) => current + 1), []);

  const value = useMemo<AuthContextValue>(
    () => ({ phase, user, legacyEntryCount, needsSetupCode, notice, problem, accept, signOut, retry }),
    [phase, user, legacyEntryCount, needsSetupCode, notice, problem, accept, signOut, retry],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

/** The signed-in person. Only for components that are shown once someone is signed in. */
export function useCurrentUser(): AccountUserDto {
  const { user } = useAuth();
  if (!user) throw new Error('useCurrentUser used while nobody is signed in');
  return user;
}

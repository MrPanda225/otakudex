import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { parseAccessLink, type AccessLink } from '../lib/access.ts';
import { prefetchSignedInApp } from '../shell-loader.ts';
import { useAuth } from './AuthProvider.tsx';
import { BackdropProvider } from './Backdrop.tsx';
import { JoinScreen, LinkWhileSignedIn, LoginScreen, ResetScreen, SetupScreen, Splash, Unreachable } from './screens.tsx';

/**
 * Reads an invitation or reset link from the address once, then takes its secret out of the address bar:
 * it must not stay in the history, a screenshot or a shared screen.
 */
function takeLinkFromAddress(): AccessLink | null {
  const link = parseAccessLink(window.location.hash);
  if (link) window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`);
  return link;
}

/** Nothing of the application is shown before someone is signed in (FR-80). */
export function AuthGate({ children }: { children: ComponentChildren }) {
  const { phase } = useAuth();
  const [link, setLink] = useState<AccessLink | null>(takeLinkFromAddress);
  const dropLink = () => setLink(null);

  // A link pasted into a tab that is already open only changes the "#": read it then too, and clear it at once.
  useEffect(() => {
    const onHashChange = () => {
      const pasted = takeLinkFromAddress();
      if (pasted) setLink(pasted);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const isAccessPhase = phase === 'setup' || phase === 'signed-out';
  // While the person reads the sign-in screen, the browser fetches the application behind it.
  useEffect(() => {
    if (isAccessPhase) prefetchSignedInApp();
  }, [isAccessPhase]);

  const screen = chooseScreen();
  // The wall of covers sits in the same place of the tree for every sign-in screen, so moving from one to
  // the next does not restart it; it is absent while loading and, of course, inside the application.
  const showsBackdrop = phase !== 'loading' && phase !== 'unreachable' && screen !== children;
  return <BackdropProvider isEnabled={showsBackdrop}>{screen}</BackdropProvider>;

  function chooseScreen(): ComponentChildren {
    if (phase === 'loading') return <Splash />;
    if (phase === 'unreachable') return <Unreachable />;
    if (phase === 'setup') return <SetupScreen />; // before the first account no link can be valid
    if (link !== null && phase === 'signed-in') return <LinkWhileSignedIn onKeepSession={dropLink} />;
    if (link !== null) return link.kind === 'invitation' ? <JoinScreen link={link} onLeave={dropLink} /> : <ResetScreen link={link} onLeave={dropLink} />;
    if (phase === 'signed-out') return <LoginScreen />;
    return children;
  }
}

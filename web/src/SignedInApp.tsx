import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { AccountDialog, initialOf } from './auth/AccountDialog.tsx';
import { AdminDialog } from './auth/AdminDialog.tsx';
import { useCurrentUser } from './auth/AuthProvider.tsx';
import { Splash } from './auth/screens.tsx';
import { AddDialog } from './components/AddDialog.tsx';
import { BackToTop } from './components/BackToTop.tsx';
import { DataDialog } from './components/DataDialog.tsx';
import { EntryDialog } from './components/EntryDialog.tsx';
import { Icon, type IconName } from './components/Icon.tsx';
import { LanguageButton } from './components/LanguageButton.tsx';
import { useI18n, type MessageKey } from './i18n/index.tsx';
import { RankDialog } from './components/RankDialog.tsx';
import { focusPageTitle } from './lib/focus.ts';
import { restoreScroll, useRoute, type Route } from './lib/hooks.ts';
import { useSlidingIndicator } from './motion/hooks.ts';
import { enterPage } from './motion/motion.ts';
import { ArenaPage } from './pages/ArenaPage.tsx';
import { DexPage } from './pages/DexPage.tsx';
import { StatsPage } from './pages/StatsPage.tsx';
import { TonightPage } from './pages/TonightPage.tsx';
import { LibraryProvider } from './store.tsx';
import { UiProvider, useUi } from './ui.tsx';

const BRAND = 'Otakudex';

const NAV_ITEMS: { route: Route; label: MessageKey; icon: IconName }[] = [
  { route: 'dex', label: 'nav.dex', icon: 'grid' },
  { route: 'arena', label: 'nav.arena', icon: 'trophy' },
  { route: 'stats', label: 'nav.stats', icon: 'chart' },
  { route: 'tonight', label: 'nav.tonight', icon: 'dice' },
];

const PAGES: Record<Route, () => preact.JSX.Element> = {
  dex: DexPage,
  arena: ArenaPage,
  stats: StatsPage,
  tonight: TonightPage,
};

/** Everything a signed-in person sees. Loaded as a separate file (see shell-loader.ts). */
export default function SignedInApp() {
  const { isAppReady, loadAppMessages } = useI18n();
  // The application's own texts come with it; until they are here the screen shows the short loading mark.
  useEffect(loadAppMessages, [loadAppMessages]);
  if (!isAppReady) return <Splash />;
  return (
    <LibraryProvider>
      <UiProvider>
        <Shell />
      </UiProvider>
    </LibraryProvider>
  );
}

function Shell() {
  const ui = useUi();
  const { t } = useI18n();
  const user = useCurrentUser();
  const route = useRoute();
  const Page = PAGES[route];
  const main = useRef<HTMLElement>(null);
  const hasNavigated = useRef(false);

  // A change of page: the document says where we are, the page is put back where it was left,
  // it arrives with a short motion, and keyboard focus moves to its title.
  useLayoutEffect(() => {
    const current = NAV_ITEMS.find((item) => item.route === route);
    document.title = `${current ? t(current.label) : BRAND} · ${BRAND}`;
    restoreScroll(route);
    enterPage(main.current);
    const isFirstPage = !hasNavigated.current;
    hasNavigated.current = true;
    // On the very first load the browser's own focus handling is left alone.
    if (isFirstPage || !main.current) return;
    return focusPageTitle(main.current);
  }, [route, t]);

  const isOverlayOpen = ui.isAddOpen || ui.isDataOpen || ui.isAccountOpen || ui.isAdminOpen || ui.openedEntryId !== null || ui.rankingEntryId !== null;

  return (
    <div class="shell">
      <a class="skip-link" href="#contenu">{t('shell.skip')}</a>
      <header class="topbar">
        <div class="topbar-inner">
          <a class="brand" href="#/dex" aria-label={t('shell.home')}>
            <span class="brand-mark" aria-hidden="true" />
            <span class="brand-name">{BRAND}</span>
          </a>
          <NavLinks route={route} className="nav" label={t('shell.navMain')} />
          <div class="topbar-actions">
            <button type="button" class="btn btn--primary" onClick={ui.openAdd} aria-keyshortcuts="/">
              <Icon name="plus" />
              {t('shell.add')}
            </button>
            <button type="button" class="btn btn--quiet btn--data" onClick={ui.openData} aria-label={t('shell.dataLabel')}>
              <Icon name="dots" />
              <span class="btn-label">{t('shell.data')}</span>
            </button>
            <LanguageButton />
            <button type="button" class="avatar-btn" onClick={ui.openAccount} aria-label={t('shell.account', { name: user.displayName })}>
              {initialOf(user.displayName)}
            </button>
          </div>
        </div>
      </header>

      <main class="page" id="contenu" ref={main} tabIndex={-1}>
        <Page key={route} />
      </main>

      <NavLinks route={route} className="bottom-nav" label={t('shell.navShort')} />
      <BackToTop isHidden={isOverlayOpen} />

      <AddDialog isOpen={ui.isAddOpen} onClose={ui.closeAdd} />
      <EntryDialog />
      <RankDialog />
      <DataDialog isOpen={ui.isDataOpen} onClose={ui.closeData} />
      <AccountDialog />
      <AdminDialog />
    </div>
  );
}

function NavLinks({ route, className, label }: { route: Route; className: string; label: string }) {
  const { t } = useI18n();
  const { containerRef, indicatorRef } = useSlidingIndicator<HTMLElement>(route);
  return (
    <nav class={className} aria-label={label} ref={containerRef}>
      <span class="indicator" ref={indicatorRef} aria-hidden="true" />
      {NAV_ITEMS.map((item) => (
        <a key={item.route} href={`#/${item.route}`} data-active={route === item.route} aria-current={route === item.route ? 'page' : undefined}>
          <Icon name={item.icon} />
          {t(item.label)}
        </a>
      ))}
    </nav>
  );
}

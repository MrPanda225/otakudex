import { lazy, Suspense } from 'preact/compat';
import { AuthGate } from './auth/AuthGate.tsx';
import { AuthProvider } from './auth/AuthProvider.tsx';
import { I18nProvider } from './i18n/index.tsx';
import { Splash } from './auth/screens.tsx';
import { loadSignedInApp } from './shell-loader.ts';
import { ToastProvider } from './toast.tsx';

const SignedInApp = lazy(loadSignedInApp);

export function App() {
  return (
    <I18nProvider>
      <ToastProvider>
        <AuthProvider>
          <AuthGate>
            <Suspense fallback={<Splash />}>
              <SignedInApp />
            </Suspense>
          </AuthGate>
        </AuthProvider>
      </ToastProvider>
    </I18nProvider>
  );
}

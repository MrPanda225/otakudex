import type { ComponentChildren } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { LinkKind, LinkPreviewDto } from '../../../shared/domain.ts';
import { passwordLengthProblem } from '../../../shared/account-rules.ts';
import { MIN_PASSWORD_LENGTH } from '../../../shared/account-rules.ts';
import { api, ApiError, errorMessage } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { LanguageButton } from '../components/LanguageButton.tsx';
import { useI18n } from '../i18n/index.tsx';
import type { Problem } from '../i18n/problem.ts';
import { emailProblem, nameProblem, requiredPasswordProblem, type AccessLink } from '../lib/access.ts';
import { useToast } from '../toast.tsx';
import { useAuth } from './AuthProvider.tsx';
import { BackdropCredit } from './Backdrop.tsx';
import { FormError, SubmitButton, TextField, useField, useSubmit, validateAll } from './form.tsx';

const PASSWORD_HINT = { key: 'field.passwordHint', params: { min: MIN_PASSWORD_LENGTH } } as const;

function setupCodeProblem(value: string): Problem | null {
  return value.trim() === '' ? { key: 'problem.setupCodeEmpty' } : null;
}

interface AccessCardProps {
  title: string;
  /** What the browser tab says. Defaults to the title. */
  documentTitle?: string;
  intro?: ComponentChildren;
  children?: ComponentChildren;
  footer?: ComponentChildren;
}

const BRAND = 'Otakudex';

/** The frame of every screen shown before sign-in: the brand, a title that takes the focus, and one card. */
function AccessCard({ title, documentTitle, intro, children, footer }: AccessCardProps) {
  const heading = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    document.title = `${documentTitle ?? title} · ${BRAND}`;
    heading.current?.focus({ preventScroll: true }); // a screen reader says where it is, a keyboard user is one Tab from the first field
  }, [title, documentTitle]);

  return (
    <div class="auth-shell">
      <LanguageButton class="auth-lang" />
      <div class="auth-card">
        <div class="auth-brand">
          <span class="brand-mark" aria-hidden="true" />
          {BRAND}
        </div>
        <div class="auth-heading">
          <h1 ref={heading} tabIndex={-1}>{title}</h1>
          {intro}
        </div>
        {children}
        {footer ? <p class="auth-foot">{footer}</p> : null}
      </div>
      <BackdropCredit />
    </div>
  );
}

/** Shown for the very short moment the server is asked who is signed in. */
export function Splash() {
  const { t } = useI18n();
  return (
    <div class="auth-shell">
      <div class="auth-brand" role="status" aria-live="polite">
        <span class="brand-mark" aria-hidden="true" />
        {BRAND}
        <span class="visually-hidden">{t('common.loading')}</span>
      </div>
    </div>
  );
}

export function Unreachable() {
  const { problem, retry } = useAuth();
  const { t } = useI18n();
  return (
    <AccessCard title={t('unreachable.title')} documentTitle={t('unreachable.documentTitle')}>
      <FormError message={problem} />
      <button type="button" class="btn btn--primary btn--wide" onClick={retry}>{t('unreachable.retry')}</button>
    </AccessCard>
  );
}

export function LoginScreen() {
  const { accept, notice } = useAuth();
  const { t } = useI18n();
  const email = useField(emailProblem);
  const password = useField(requiredPasswordProblem);
  const { isPending, formError, run } = useSubmit();
  const [isForgotOpen, setForgotOpen] = useState(false);

  function submit(event: Event) {
    event.preventDefault();
    if (isPending || !validateAll([email, password])) return;
    void run(async () => {
      try {
        accept((await api.auth.login({ email: email.value, password: password.value })).user);
      } catch (error) {
        password.focus();
        throw error;
      }
    });
  }

  return (
    <AccessCard title={t('login.title')} documentTitle={t('login.documentTitle')} footer={t('login.invited')}>
      {notice === 'expired' ? (
        <div class="notice" role="status">
          <Icon name="alert" />
          <p>{t('login.expired')}</p>
        </div>
      ) : null}
      <form class="auth-form" onSubmit={submit} noValidate>
        <TextField label="field.email" field={email} type="email" inputMode="email" autoComplete="username" />
        <TextField label="field.password" field={password} type="password" autoComplete="current-password" />
        <FormError message={formError} />
        <SubmitButton label="login.submit" isPending={isPending} />
        <div class="auth-forgot">
          <button type="button" class="link-btn" aria-expanded={isForgotOpen} aria-controls="forgot-help" onClick={() => setForgotOpen(!isForgotOpen)}>
            {t('login.forgot')}
          </button>
          {isForgotOpen ? <p id="forgot-help" class="muted">{t('login.forgotHelp')}</p> : null}
        </div>
      </form>
    </AccessCard>
  );
}

/** Which field a refused submission is about: a taken e-mail belongs to the e-mail, a weak password to the password. */
function explainFieldError(error: unknown, fields: { email?: ReturnType<typeof useField>; password: ReturnType<typeof useField> }): boolean {
  if (!(error instanceof ApiError)) return false;
  if (error.code === 'auth.emailTaken' && fields.email) {
    fields.email.setError({ text: error.message });
    fields.email.focus();
    return true;
  }
  if (error.code?.startsWith('password.')) {
    fields.password.setError({ text: error.message });
    fields.password.focus();
    return true;
  }
  return false;
}

export function SetupScreen() {
  const { accept, legacyEntryCount, needsSetupCode } = useAuth();
  const { t } = useI18n();
  const notify = useToast();
  const name = useField(nameProblem);
  const email = useField(emailProblem);
  const password = useField(passwordLengthProblem);
  const setupCode = useField(needsSetupCode ? setupCodeProblem : () => null);
  const { isPending, formError, run } = useSubmit();

  function submit(event: Event) {
    event.preventDefault();
    const fields = needsSetupCode ? [name, email, password, setupCode] : [name, email, password];
    if (isPending || !validateAll(fields)) return;
    void run(
      async () => {
        const { user } = await api.auth.setup({
          displayName: name.value,
          email: email.value,
          password: password.value,
          ...(needsSetupCode ? { setupCode: setupCode.value } : {}),
        });
        accept(user);
        notify(t('welcome', { name: user.displayName }));
      },
      (error) => {
        // A wrong creation code is refused with 403: it belongs to its own field.
        if (error instanceof ApiError && error.code === 'auth.wrongSetupCode') {
          setupCode.setError({ text: error.message });
          setupCode.focus();
          return true;
        }
        return explainFieldError(error, { email, password });
      },
    );
  }

  return (
    <AccessCard
      title={t('setup.title')}
      intro={
        <>
          <p class="muted">{t('setup.intro')}</p>
          {legacyEntryCount > 0 ? (
            <div class="notice" role="note">
              <Icon name="check" />
              <p>{t('setup.legacy', { count: legacyEntryCount })}</p>
            </div>
          ) : null}
        </>
      }
    >
      <form class="auth-form" onSubmit={submit} noValidate>
        <TextField label="field.name" field={name} autoComplete="name" />
        <TextField label="field.email" field={email} type="email" inputMode="email" autoComplete="username" />
        <TextField label="field.password" field={password} type="password" autoComplete="new-password" hint={PASSWORD_HINT} />
        {needsSetupCode ? <TextField label="field.setupCode" field={setupCode} autoComplete="off" hint={{ key: 'field.setupCodeHint' }} /> : null}
        <FormError message={formError} />
        <SubmitButton label="setup.submit" isPending={isPending} />
      </form>
    </AccessCard>
  );
}

type LinkState = { kind: 'checking' } | { kind: 'valid'; preview: LinkPreviewDto } | { kind: 'invalid'; message: string };

/** Asks the server whether a link is usable, before showing a form for it. */
function useLinkPreview(link: AccessLink): LinkState {
  const [state, setState] = useState<LinkState>({ kind: 'checking' });
  useEffect(() => {
    let isStale = false;
    api.auth
      .checkLink(link.token, link.kind)
      .then((preview) => !isStale && setState({ kind: 'valid', preview }))
      .catch((error: unknown) => !isStale && setState({ kind: 'invalid', message: errorMessage(error) }));
    return () => {
      isStale = true;
    };
  }, [link.token, link.kind]);
  return state;
}

function InvalidLink({ kind, message, onLeave }: { kind: LinkKind; message: string; onLeave: () => void }) {
  const { t } = useI18n();
  return (
    <AccessCard title={t(kind === 'invitation' ? 'link.invalidInvitation' : 'link.invalidReset')} documentTitle={t('link.invalidDocumentTitle')}>
      <FormError message={message} />
      <button type="button" class="btn btn--wide" onClick={onLeave}>{t('link.toSignIn')}</button>
    </AccessCard>
  );
}

export function JoinScreen({ link, onLeave }: { link: AccessLink; onLeave: () => void }) {
  const state = useLinkPreview(link);
  if (state.kind === 'checking') return <Splash />;
  if (state.kind === 'invalid') return <InvalidLink kind="invitation" message={state.message} onLeave={onLeave} />;
  return <JoinForm token={link.token} preview={state.preview} onDone={onLeave} />;
}

function JoinForm({ token, preview, onDone }: { token: string; preview: LinkPreviewDto; onDone: () => void }) {
  const { accept } = useAuth();
  const { t } = useI18n();
  const notify = useToast();
  // The administrator wrote the first name of the friend on the invitation: start from it.
  const name = useField(nameProblem, preview.label ?? '');
  const email = useField(emailProblem);
  const password = useField(passwordLengthProblem);
  const { isPending, formError, run } = useSubmit();

  function submit(event: Event) {
    event.preventDefault();
    if (isPending || !validateAll([name, email, password])) return;
    void run(
      async () => {
        const { user } = await api.auth.join({ token, displayName: name.value, email: email.value, password: password.value });
        accept(user);
        onDone();
        notify(t('welcome', { name: user.displayName }));
      },
      (error) => explainFieldError(error, { email, password }),
    );
  }

  const title = preview.inviterName ? t('join.title', { name: preview.inviterName }) : t('join.titleAnonymous');
  return (
    <AccessCard title={title} documentTitle={t('join.documentTitle')} intro={<p class="muted">{t('join.intro')}</p>}>
      <form class="auth-form" onSubmit={submit} noValidate>
        <TextField label="field.name" field={name} autoComplete="name" />
        <TextField label="field.email" field={email} type="email" inputMode="email" autoComplete="username" />
        <TextField label="field.password" field={password} type="password" autoComplete="new-password" hint={PASSWORD_HINT} />
        <FormError message={formError} />
        <SubmitButton label="join.submit" isPending={isPending} />
      </form>
    </AccessCard>
  );
}

export function ResetScreen({ link, onLeave }: { link: AccessLink; onLeave: () => void }) {
  const state = useLinkPreview(link);
  if (state.kind === 'checking') return <Splash />;
  if (state.kind === 'invalid') return <InvalidLink kind="reset" message={state.message} onLeave={onLeave} />;
  return <ResetForm token={link.token} preview={state.preview} onDone={onLeave} />;
}

function ResetForm({ token, preview, onDone }: { token: string; preview: LinkPreviewDto; onDone: () => void }) {
  const { accept } = useAuth();
  const { t } = useI18n();
  const notify = useToast();
  const password = useField(passwordLengthProblem);
  const { isPending, formError, run } = useSubmit();

  function submit(event: Event) {
    event.preventDefault();
    if (isPending || !validateAll([password])) return;
    void run(
      async () => {
        const { user } = await api.auth.reset({ token, password: password.value });
        accept(user);
        onDone();
        notify(t('reset.done'));
      },
      (error) => explainFieldError(error, { password }),
    );
  }

  return (
    <AccessCard title={t('reset.title')} intro={preview.accountName ? <p class="muted">{t('reset.intro', { name: preview.accountName })}</p> : null}>
      <form class="auth-form" onSubmit={submit} noValidate>
        <TextField label="field.passwordNew" field={password} type="password" autoComplete="new-password" hint={PASSWORD_HINT} />
        <FormError message={formError} />
        <SubmitButton label="reset.submit" isPending={isPending} />
      </form>
    </AccessCard>
  );
}

/** An invitation or reset link was opened in a browser that is already signed in: ask what to do, never decide. */
export function LinkWhileSignedIn({ onKeepSession }: { onKeepSession: () => void }) {
  const { user, signOut } = useAuth();
  const { t } = useI18n();
  return (
    <AccessCard title={t('linkWhileSignedIn.title')} intro={<p class="muted">{t('linkWhileSignedIn.intro', { name: user?.displayName ?? '' })}</p>}>
      <div class="auth-form">
        <button type="button" class="btn btn--primary btn--wide" onClick={onKeepSession}>{t('linkWhileSignedIn.back')}</button>
        <button type="button" class="btn btn--wide" onClick={() => void signOut()}>
          <Icon name="logout" />
          {t('linkWhileSignedIn.signOut')}
        </button>
      </div>
    </AccessCard>
  );
}

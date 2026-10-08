import { api, ApiError } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { Modal } from '../components/Modal.tsx';
import { MIN_PASSWORD_LENGTH, passwordLengthProblem } from '../../../shared/account-rules.ts';
import { requiredPasswordProblem } from '../lib/access.ts';
import { useI18n } from '../i18n/index.tsx';
import { useToast } from '../toast.tsx';
import { useUi } from '../ui.tsx';
import { useAuth, useCurrentUser } from './AuthProvider.tsx';
import { FormError, SubmitButton, TextField, useField, useSubmit, validateAll } from './form.tsx';

export function initialOf(displayName: string): string {
  return ([...displayName.trim()][0] ?? '?').toUpperCase();
}

export function AccountDialog() {
  const ui = useUi();
  const { t } = useI18n();
  return (
    <Modal isOpen={ui.isAccountOpen} onClose={ui.closeAccount} title={t('account.title')} variant="sheet">
      <AccountBody />
    </Modal>
  );
}

function AccountBody() {
  const { t } = useI18n();
  const user = useCurrentUser();
  const { signOut } = useAuth();
  const ui = useUi();
  const isAdmin = user.role === 'admin';

  return (
    <>
      <div class="account-id">
        <span class="avatar" aria-hidden="true">{initialOf(user.displayName)}</span>
        <div class="account-id-text">
          <p class="account-name">{user.displayName}</p>
          <p class="muted text-sm">{user.email}</p>
        </div>
        <span class="badge badge--wide">{t(isAdmin ? 'account.admin' : 'account.member')}</span>
      </div>

      {isAdmin ? (
        <button
          type="button"
          class="btn"
          onClick={() => {
            ui.closeAccount();
            ui.openAdmin();
          }}
        >
          <Icon name="shield" />
          {t('account.administration')}
        </button>
      ) : null}

      <details class="disclosure">
        <summary>
          <span class="disclosure-title">{t('account.changePassword')}</span>
          <span class="disclosure-chevron"><Icon name="chevron" /></span>
        </summary>
        <div class="disclosure-body">
          <ChangePasswordForm />
        </div>
      </details>

      <hr class="sheet-rule" />
      <button type="button" class="btn btn--quiet account-signout" onClick={() => void signOut()}>
        <Icon name="logout" />
        {t('account.signOut')}
      </button>
    </>
  );
}

function ChangePasswordForm() {
  const { t } = useI18n();
  const notify = useToast();
  const current = useField(requiredPasswordProblem);
  const next = useField(passwordLengthProblem);
  const { isPending, formError, run } = useSubmit();

  function submit(event: Event) {
    event.preventDefault();
    if (isPending || !validateAll([current, next])) return;
    void run(
      async () => {
        await api.auth.changePassword({ currentPassword: current.value, newPassword: next.value });
        current.setValue('');
        next.setValue('');
        notify(t('account.passwordChanged'));
      },
      (error) => {
        if (!(error instanceof ApiError) || error.status !== 400) return false;
        const field = error.code === 'auth.currentPasswordWrong' ? current : next;
        field.setError({ text: error.message });
        field.focus();
        return true;
      },
    );
  }

  return (
    <form class="auth-form" onSubmit={submit} noValidate>
      <TextField label="field.passwordCurrent" field={current} type="password" autoComplete="current-password" />
      <TextField label="field.passwordNew" field={next} type="password" autoComplete="new-password" hint={{ key: 'field.passwordHint', params: { min: MIN_PASSWORD_LENGTH } }} />
      <FormError message={formError} />
      <SubmitButton label="account.changePassword" isPending={isPending} />
    </form>
  );
}

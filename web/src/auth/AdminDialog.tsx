import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { InvitationDto, InvitationState, LinkKind, MemberDto } from '../../../shared/domain.ts';
import { api, errorMessage } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { InlineConfirm } from '../components/InlineConfirm.tsx';
import { Modal } from '../components/Modal.tsx';
import { useFormat } from '../i18n/use-format.ts';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { buildAccessLink } from '../lib/access.ts';
import { springIn } from '../motion/motion.ts';
import { useToast } from '../toast.tsx';
import { useUi } from '../ui.tsx';
import { FormError, useSubmit } from './form.tsx';

const INVITATION_STATE_LABEL = {
  pending: 'admin.state.pending',
  used: 'admin.state.used',
  expired: 'admin.state.expired',
  revoked: 'admin.state.revoked',
} as const satisfies Record<InvitationState, MessageKey>;

/** The administrator's side: who may come in, and with which link. It never shows what anyone watches. */
export function AdminDialog() {
  const ui = useUi();
  const { t } = useI18n();
  return (
    <Modal isOpen={ui.isAdminOpen} onClose={ui.closeAdmin} title={t('admin.title')} variant="sheet">
      <AdminBody />
    </Modal>
  );
}

interface IssuedLink {
  kind: LinkKind;
  token: string;
  expiresAt: string;
  /** The member a reset link is for (null for an invitation, which is for nobody yet). */
  forMemberId: number | null;
  /** The name to say next to it: the member's, or the first name written on the invitation. */
  forName: string;
}

function AdminBody() {
  const notify = useToast();
  const [members, setMembers] = useState<MemberDto[] | null>(null);
  const [invitations, setInvitations] = useState<InvitationDto[] | null>(null);
  const [issued, setIssued] = useState<IssuedLink | null>(null);

  const reload = useCallback(async () => {
    try {
      const [loadedMembers, loadedInvitations] = await Promise.all([api.admin.members(), api.admin.invitations()]);
      setMembers(loadedMembers);
      setInvitations(loadedInvitations);
    } catch (error) {
      notify(errorMessage(error), { tone: 'error' });
    }
  }, [notify]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <>
      <InviteSection issued={issued?.kind === 'invitation' ? issued : null} onIssued={setIssued} onChanged={reload} />
      <InvitationList invitations={invitations} onChanged={reload} />
      <MemberList members={members} issued={issued?.kind === 'reset' ? issued : null} onIssued={setIssued} onChanged={reload} />
    </>
  );
}

function InviteSection({ issued, onIssued, onChanged }: { issued: IssuedLink | null; onIssued: (link: IssuedLink | null) => void; onChanged: () => Promise<void> }) {
  const { t } = useI18n();
  const [label, setLabel] = useState('');
  const { isPending, formError, run } = useSubmit();

  function submit(event: Event) {
    event.preventDefault();
    if (isPending) return;
    void run(async () => {
      const name = label.trim();
      const link = await api.admin.createInvitation(name);
      onIssued({ kind: 'invitation', token: link.token, expiresAt: link.expiresAt, forMemberId: null, forName: name });
      setLabel('');
      await onChanged();
    });
  }

  return (
    <section class="admin-section" aria-labelledby="admin-invite">
      <h3 id="admin-invite">{t('admin.invite')}</h3>
      <p class="muted text-sm">{t('admin.inviteHint')}</p>
      <form class="invite-form" onSubmit={submit}>
        <div class="field">
          <label for="invite-label">{t('admin.inviteFor')}</label>
          <input id="invite-label" class="input" type="text" autoComplete="off" maxLength={60} value={label} onInput={(event) => setLabel(event.currentTarget.value)} />
        </div>
        <button type="submit" class={`btn btn--primary${isPending ? ' is-loading' : ''}`}>
          <Icon name="plus" />
          {t('admin.inviteCreate')}
        </button>
      </form>
      <FormError message={formError} />
      {issued ? <IssuedLinkCard link={issued} onDismiss={() => onIssued(null)} /> : null}
    </section>
  );
}

/** The link, shown once. It is selectable, and one button copies it. */
function IssuedLinkCard({ link, onDismiss }: { link: IssuedLink; onDismiss: () => void }) {
  const { t } = useI18n();
  const format = useFormat();
  const notify = useToast();
  const card = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const copyButton = useRef<HTMLButtonElement>(null);
  const [isCopied, setCopied] = useState(false);
  const url = buildAccessLink(window.location.origin, link);

  useLayoutEffect(() => {
    springIn(card.current);
    copyButton.current?.focus(); // the next thing to do is to copy it
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard access (an address that is not HTTPS): select the text so Ctrl+C does the job.
      field.current?.focus();
      field.current?.select();
      notify(t('admin.selected'));
    }
  }

  const heading = t(link.kind === 'invitation' ? 'admin.linkInvitation' : 'admin.linkReset');
  const title = link.forName ? t('admin.linkFor', { heading, name: link.forName }) : heading;
  const expires = format.expiresIn(link.expiresAt, new Date());
  const validity = link.kind === 'invitation' ? `${expires.charAt(0).toUpperCase()}${expires.slice(1)}.` : t('admin.valid24h');
  return (
    <div class="issued-link" ref={card} role="group" aria-label={title}>
      <p class="issued-title">{title}</p>
      <div class="field-control">
        <input ref={field} class="input" type="text" readOnly value={url} aria-label={heading} onFocus={(event) => event.currentTarget.select()} />
        <button type="button" class="btn btn--small" ref={copyButton} onClick={() => void copy()}>
          <Icon name={isCopied ? 'check' : 'copy'} />
          {t(isCopied ? 'admin.copied' : 'admin.copy')}
        </button>
      </div>
      <p class="field-hint">{t('admin.linkOnce')} {validity}</p>
      <button type="button" class="link-btn" onClick={onDismiss}>{t('admin.dismiss')}</button>
    </div>
  );
}

function InvitationList({ invitations, onChanged }: { invitations: InvitationDto[] | null; onChanged: () => Promise<void> }) {
  const { t } = useI18n();
  const format = useFormat();
  const notify = useToast();
  const now = new Date();

  async function revoke(invitation: InvitationDto) {
    try {
      await api.admin.revokeInvitation(invitation.id);
      notify(t('admin.revoked'));
      await onChanged();
    } catch (error) {
      notify(errorMessage(error), { tone: 'error' });
    }
  }

  return (
    <section class="admin-section" aria-labelledby="admin-invitations">
      <h3 id="admin-invitations">{t('admin.invitations')}</h3>
      {invitations === null ? <p class="muted text-sm">{t('common.loading')}</p> : null}
      {invitations?.length === 0 ? <p class="muted text-sm">{t('admin.noInvitations')}</p> : null}
      <ul class="admin-list">
        {invitations?.map((invitation) => (
          <li key={invitation.id} class="admin-row">
            <div class="admin-row-text">
              <p class="admin-row-name">{invitation.label ?? t('admin.noName')}</p>
              <p class="muted text-sm">
                {t(INVITATION_STATE_LABEL[invitation.state])}
                {invitation.state === 'pending' ? ` · ${format.expiresIn(invitation.expiresAt, now)}` : ''}
              </p>
            </div>
            {invitation.state === 'pending' ? (
              <button type="button" class="btn btn--quiet btn--small" onClick={() => void revoke(invitation)}>
                {t('admin.revoke')}
              </button>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

function MemberList({
  members,
  issued,
  onIssued,
  onChanged,
}: {
  members: MemberDto[] | null;
  issued: IssuedLink | null;
  onIssued: (link: IssuedLink | null) => void;
  onChanged: () => Promise<void>;
}) {
  const { t } = useI18n();
  const format = useFormat();
  const notify = useToast();

  async function setDisabled(member: MemberDto, isDisabled: boolean) {
    try {
      await api.admin.setDisabled(member.id, isDisabled);
      notify(t(isDisabled ? 'admin.disabledToast' : 'admin.enabledToast', { name: member.displayName }));
      await onChanged();
    } catch (error) {
      notify(errorMessage(error), { tone: 'error' });
    }
  }

  async function createResetLink(member: MemberDto) {
    try {
      const link = await api.admin.createResetLink(member.id);
      onIssued({ kind: 'reset', token: link.token, expiresAt: link.expiresAt, forMemberId: member.id, forName: member.displayName });
    } catch (error) {
      notify(errorMessage(error), { tone: 'error' });
    }
  }

  return (
    <section class="admin-section" aria-labelledby="admin-members">
      <h3 id="admin-members">{t('admin.members')}</h3>
      {members === null ? <p class="muted text-sm">{t('common.loading')}</p> : null}
      <ul class="admin-list">
        {members?.map((member) => (
          <li key={member.id} class="admin-member">
            <div class="admin-row">
              <div class="admin-row-text">
                <p class="admin-row-name">
                  {member.displayName}
                  {member.role === 'admin' ? <span class="badge badge--wide">{t('account.admin')}</span> : null}
                  {member.isDisabled ? <span class="badge badge--wide">{t('admin.deactivatedBadge')}</span> : null}
                </p>
                <p class="muted text-sm">{member.email}</p>
                <p class="muted text-sm">{member.lastLoginAt ? t('admin.lastLogin', { date: format.shortDate(member.lastLoginAt.slice(0, 10)) }) : t('admin.neverLoggedIn')}</p>
              </div>
            </div>
            {member.role === 'member' ? (
              <div class="admin-actions">
                {!member.isDisabled ? (
                  <button type="button" class="btn btn--small" onClick={() => void createResetLink(member)}>
                    {t('admin.linkReset')}
                  </button>
                ) : null}
                {member.isDisabled ? (
                  <button type="button" class="btn btn--small" onClick={() => void setDisabled(member, false)}>
                    {t('admin.reactivate')}
                  </button>
                ) : (
                  <InlineConfirm
                    triggerLabel={t('admin.deactivate')}
                    triggerClass="btn btn--quiet btn--small btn--danger-text"
                    message={t('admin.deactivateConfirm', { name: member.displayName })}
                    confirmLabel={t('admin.deactivateYes')}
                    cancelLabel={t('admin.keepAccess')}
                    onConfirm={() => void setDisabled(member, true)}
                  />
                )}
              </div>
            ) : null}
            {issued && issued.forMemberId === member.id ? <IssuedLinkCard link={issued} onDismiss={() => onIssued(null)} /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

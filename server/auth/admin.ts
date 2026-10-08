import type { InvitationDto, InvitationState, IssuedLinkDto, LinkKind, MemberDto, Role } from '../../shared/domain.ts';
import type { Database, Queryable } from '../db/database.ts';
import { NotFoundError, ValidationError } from '../errors.ts';
import { revokePendingResetLinks } from './links.ts';
import { generateToken, hashToken } from './tokens.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const INVITATION_LIFETIME_MS = 7 * DAY_MS;
const RESET_LINK_LIFETIME_MS = 1 * DAY_MS;
const MAX_LISTED_INVITATIONS = 50;

export interface AdminServiceDeps {
  db: Database;
  now?: () => Date;
}

interface MemberRow {
  id: number;
  email: string;
  display_name: string;
  role: Role;
  is_disabled: boolean;
  created_at: string;
  last_login_at: string | null;
}

function toMemberDto(row: MemberRow): MemberDto {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    isDisabled: row.is_disabled,
    createdAt: row.created_at,
    lastLoginAt: row.last_login_at,
  };
}

const MEMBER_SELECT = `SELECT id, email, display_name, role, is_disabled, created_at, last_login_at FROM app_user WHERE email IS NOT NULL`;

/**
 * What the administrator can do with accounts. Nothing here reads a library entry, a note or a statistic
 * of another person: the administrator manages access, not what members watch (FR-97).
 */
export function createAdminService({ db, now = () => new Date() }: AdminServiceDeps) {
  async function issueLink(
    q: Queryable,
    link: { kind: LinkKind; createdBy: number; label: string | null; userId: number | null; lifetimeMs: number },
  ): Promise<IssuedLinkDto> {
    const token = generateToken();
    const expiresAt = new Date(now().getTime() + link.lifetimeMs).toISOString();
    await q.query(
      `INSERT INTO account_link (kind, token_hash, label, user_id, created_by, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6::timestamptz)`,
      [link.kind, hashToken(token), link.label, link.userId, link.createdBy, expiresAt],
    );
    return { token, expiresAt };
  }

  async function findMember(q: Queryable, memberId: number): Promise<MemberRow> {
    const [row] = await q.query<MemberRow>(`${MEMBER_SELECT} AND id = $1`, [memberId]);
    if (!row) throw new NotFoundError('admin.accountNotFound');
    return row;
  }

  return {
    async listMembers(): Promise<MemberDto[]> {
      const rows = await db.query<MemberRow>(`${MEMBER_SELECT} ORDER BY role, id`);
      return rows.map(toMemberDto);
    },

    /** Closes (or reopens) a member's access. Closing also ends their sessions; their library is kept. */
    async setDisabled(memberId: number, isDisabled: boolean): Promise<MemberDto> {
      return db.transaction(async (tx) => {
        const member = await findMember(tx, memberId);
        if (member.role === 'admin') throw new ValidationError('admin.cannotDeactivateAdmin');
        await tx.query('UPDATE app_user SET is_disabled = $2 WHERE id = $1', [memberId, isDisabled]);
        if (isDisabled) await tx.query('DELETE FROM app_session WHERE user_id = $1', [memberId]);
        return toMemberDto({ ...member, is_disabled: isDisabled });
      });
    },

    createInvitation(adminId: number, label: string | null): Promise<IssuedLinkDto> {
      return issueLink(db, { kind: 'invitation', createdBy: adminId, label, userId: null, lifetimeMs: INVITATION_LIFETIME_MS });
    },

    async listInvitations(): Promise<InvitationDto[]> {
      const rows = await db.query<{ id: number; label: string | null; created_at: string; expires_at: string; state: InvitationState }>(
        `SELECT id, label, created_at, expires_at,
                CASE WHEN revoked_at IS NOT NULL THEN 'revoked'
                     WHEN used_at IS NOT NULL THEN 'used'
                     WHEN expires_at <= $1::timestamptz THEN 'expired'
                     ELSE 'pending' END AS state
           FROM account_link
          WHERE kind = 'invitation'
          ORDER BY created_at DESC, id DESC
          LIMIT $2`,
        [now().toISOString(), MAX_LISTED_INVITATIONS],
      );
      return rows.map((row) => ({ id: row.id, label: row.label, createdAt: row.created_at, expiresAt: row.expires_at, state: row.state }));
    },

    /** Revokes an invitation that is still waiting. One that was used or has expired is left alone. */
    async revokeInvitation(invitationId: number): Promise<void> {
      const revoked = await db.query(
        `UPDATE account_link SET revoked_at = $2::timestamptz
          WHERE id = $1 AND kind = 'invitation' AND used_at IS NULL AND revoked_at IS NULL AND expires_at > $2::timestamptz
          RETURNING id`,
        [invitationId, now().toISOString()],
      );
      if (revoked.length === 0) throw new NotFoundError('admin.invitationNotPending');
    },

    async createResetLink(adminId: number, memberId: number): Promise<IssuedLinkDto> {
      return db.transaction(async (tx) => {
        const member = await findMember(tx, memberId);
        await revokePendingResetLinks(tx, member.id, now()); // one live link per account: the newest
        return issueLink(tx, { kind: 'reset', createdBy: adminId, label: null, userId: member.id, lifetimeMs: RESET_LINK_LIFETIME_MS });
      });
    },

    /** For the command line on the server: a reset link for any account, the administrator's included. */
    async createResetLinkByEmail(email: string): Promise<IssuedLinkDto> {
      const [target] = await db.query<{ id: number }>('SELECT id FROM app_user WHERE email = $1', [email.trim().toLowerCase()]);
      if (!target) throw new NotFoundError('admin.noAccountForEmail');
      const [admin] = await db.query<{ id: number }>("SELECT id FROM app_user WHERE role = 'admin'");
      if (!admin) throw new NotFoundError('admin.noAdmin');
      return db.transaction(async (tx) => {
        await revokePendingResetLinks(tx, target.id, now());
        return issueLink(tx, { kind: 'reset', createdBy: admin.id, label: null, userId: target.id, lifetimeMs: RESET_LINK_LIFETIME_MS });
      });
    },
  };
}

export type AdminService = ReturnType<typeof createAdminService>;

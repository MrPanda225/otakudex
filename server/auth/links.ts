import type { Queryable } from '../db/database.ts';

/**
 * Cancels the reset links of an account that nobody used yet. Called when a new one is issued, when one is
 * used and when the password changes: a link left in an old conversation must not outlive what it was for.
 */
export async function revokePendingResetLinks(q: Queryable, userId: number, at: Date): Promise<void> {
  await q.query(
    `UPDATE account_link SET revoked_at = $2::timestamptz
      WHERE kind = 'reset' AND user_id = $1 AND used_at IS NULL AND revoked_at IS NULL`,
    [userId, at.toISOString()],
  );
}

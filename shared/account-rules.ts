/**
 * Rules about accounts that the server enforces and the interface can check early, so a person hears
 * "15 characters at least (you have 11)" at once instead of after a round trip. The server stays the
 * authority: the interface only ever repeats a check, never replaces it.
 */

/** NIST SP 800-63B-4: 15 characters at least when the password is the only factor. */
export const MIN_PASSWORD_LENGTH = 15;
export const MAX_PASSWORD_LENGTH = 128;
export const MAX_DISPLAY_NAME_LENGTH = 60;

/** What is wrong with a password, as a message key and its values; each side words it in the user's language. */
export interface PasswordProblem {
  key: 'password.tooShort' | 'password.tooLong' | 'password.tooGuessable';
  params: Record<string, number>;
}

/** The problem with a password that is too short or too long, or null. Characters are counted after NFC normalisation. */
export function passwordLengthProblem(password: string): PasswordProblem | null {
  const count = [...password.normalize('NFC')].length;
  const params = { min: MIN_PASSWORD_LENGTH, max: MAX_PASSWORD_LENGTH, count };
  if (count < MIN_PASSWORD_LENGTH) return { key: 'password.tooShort', params };
  if (count > MAX_PASSWORD_LENGTH) return { key: 'password.tooLong', params };
  return null;
}

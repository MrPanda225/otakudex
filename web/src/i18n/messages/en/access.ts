import type { access as french } from '../fr/access.ts';

/** English texts of the access bundle: same keys, same {holes} as the French reference. */
export const access: Record<keyof typeof french, string> = {
  // Language button (the label of each is written in the language it switches to)
  'lang.toEn': 'Switch to English',
  'lang.toFr': 'Passer en français',

  // Shared by every access screen
  'common.loading': 'Loading…',
  'api.unreachable': 'Can’t reach the server. Try again in a moment.',
  'backdrop.credit': 'Posters: Kitsu',

  // Form fields
  'field.name': 'First name or nickname',
  'field.email': 'E-mail',
  'field.password': 'Password',
  'field.passwordNew': 'New password',
  'field.setupCode': 'Setup code',
  'field.showPassword': 'Show password',
  'field.hidePassword': 'Hide password',
  'field.passwordHint': '{min} characters or more: a phrase works.',
  'field.setupCodeHint': 'Set on the server (SETUP_CODE).',

  // Messages under a field
  'problem.emailEmpty': 'Enter your e-mail.',
  'problem.emailInvalid': 'Not a valid e-mail, such as name@example.com.',
  'problem.nameEmpty': 'Enter a first name or a nickname.',
  'problem.nameTooLong': '{max} characters at most.',
  'problem.passwordEmpty': 'Enter your password.',
  'problem.setupCodeEmpty': 'Enter the setup code.',
  'password.tooShort': 'At least {min} characters (you have {count}).',
  'password.tooLong': '{max} characters at most.',

  // Sign in
  'login.title': 'Welcome back',
  'login.documentTitle': 'Sign in',
  'login.submit': 'Sign in',
  'login.expired': 'Session expired. Sign in again.',
  'login.invited': 'Invited? Open the link you were sent.',
  'login.forgot': 'Forgot your password?',
  'login.forgotHelp': 'Ask whoever runs the app for a reset link.',

  // First account
  'setup.title': 'Create your account',
  'setup.intro': 'First account: you’re the one who invites the others.',
  'setup.legacy.one': 'Your anime will be attached to this account.',
  'setup.legacy.other': 'Your {count} anime will be attached to this account.',
  'setup.submit': 'Create account',
  welcome: 'Welcome, {name}!',

  // Invitation
  'join.title': '{name} invited you to Otakudex',
  'join.titleAnonymous': 'You’re invited to Otakudex',
  'join.documentTitle': 'Invitation',
  'join.intro': 'Your Dex stays private.',
  'join.submit': 'Join',

  // Password reset
  'reset.title': 'New password',
  'reset.intro': 'For {name}’s account.',
  'reset.submit': 'Save',
  'reset.done': 'Password changed.',

  // Invalid link
  'link.invalidInvitation': 'Invalid invitation',
  'link.invalidReset': 'Invalid link',
  'link.invalidDocumentTitle': 'Invalid link',
  'link.toSignIn': 'Go to sign in',

  // Already signed in
  'linkWhileSignedIn.title': 'You’re already signed in',
  'linkWhileSignedIn.intro': 'Signed in as {name}. Sign out to use this link.',
  'linkWhileSignedIn.back': 'Back to your Dex',
  'linkWhileSignedIn.signOut': 'Sign out and use the link',

  // Server unreachable
  'unreachable.title': 'Server unreachable',
  'unreachable.documentTitle': 'Offline',
  'unreachable.retry': 'Try again',

  // Signing out
  'signOut.failed': 'Couldn’t sign out: your session is still open. {reason}',
  'password.tooGuessable': 'Too easy to guess. Pick a more personal phrase.',
  'api.unexpected': 'Something went wrong. Try again in a moment.',
  // @entries
};

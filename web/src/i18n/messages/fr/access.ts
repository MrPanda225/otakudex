/**
 * French texts of the access bundle. The reference: English must have the same keys and the same {holes}.
 * Voice and rules: docs/07-langues-et-textes.md. A text that depends on a number has a .one and a .other form.
 */
export const access = {
  // Language button (the label of each is written in the language it switches to)
  'lang.toEn': 'Switch to English',
  'lang.toFr': 'Passer en français',

  // Shared by every access screen
  'common.loading': 'Chargement…',
  'api.unreachable': 'Impossible de joindre le serveur. Réessaie dans un instant.',
  'backdrop.credit': 'Affiches : Kitsu',

  // Form fields
  'field.name': 'Prénom ou pseudo',
  'field.email': 'E-mail',
  'field.password': 'Mot de passe',
  'field.passwordNew': 'Nouveau mot de passe',
  'field.setupCode': 'Code de création',
  'field.showPassword': 'Afficher le mot de passe',
  'field.hidePassword': 'Masquer le mot de passe',
  'field.passwordHint': '{min} caractères ou plus : une phrase suffit.',
  'field.setupCodeHint': 'Défini sur le serveur (SETUP_CODE).',

  // Messages under a field
  'problem.emailEmpty': 'Écris ton e-mail.',
  'problem.emailInvalid': 'E-mail invalide, par exemple prenom@exemple.fr.',
  'problem.nameEmpty': 'Écris un prénom ou un pseudo.',
  'problem.nameTooLong': '{max} caractères au maximum.',
  'problem.passwordEmpty': 'Écris ton mot de passe.',
  'problem.setupCodeEmpty': 'Écris le code de création.',
  'password.tooShort': '{min} caractères minimum (tu en as {count}).',
  'password.tooLong': '{max} caractères au maximum.',

  // Sign in
  'login.title': 'Content de te revoir',
  'login.documentTitle': 'Connexion',
  'login.submit': 'Se connecter',
  'login.expired': 'Session expirée. Reconnecte-toi.',
  'login.invited': 'Invité ? Ouvre le lien qu’on t’a envoyé.',
  'login.forgot': 'Mot de passe oublié ?',
  'login.forgotHelp': 'Demande un lien de réinitialisation à la personne qui gère l’application.',

  // First account
  'setup.title': 'Crée ton compte',
  'setup.intro': 'Premier compte : c’est toi qui invites les autres.',
  'setup.legacy.one': 'Ton anime sera rattaché à ce compte.',
  'setup.legacy.other': 'Tes {count} anime seront rattachés à ce compte.',
  'setup.submit': 'Créer le compte',
  welcome: 'Bienvenue, {name} !',

  // Invitation
  'join.title': '{name} t’invite sur Otakudex',
  'join.titleAnonymous': 'Tu es invité sur Otakudex',
  'join.documentTitle': 'Invitation',
  'join.intro': 'Ton Dex reste privé.',
  'join.submit': 'Rejoindre',

  // Password reset
  'reset.title': 'Nouveau mot de passe',
  'reset.intro': 'Pour le compte de {name}.',
  'reset.submit': 'Enregistrer',
  'reset.done': 'Mot de passe changé.',

  // Invalid link
  'link.invalidInvitation': 'Invitation invalide',
  'link.invalidReset': 'Lien invalide',
  'link.invalidDocumentTitle': 'Lien invalide',
  'link.toSignIn': 'Aller à la connexion',

  // Already signed in
  'linkWhileSignedIn.title': 'Tu es déjà connecté',
  'linkWhileSignedIn.intro': 'Connecté en tant que {name}. Déconnecte-toi pour utiliser ce lien.',
  'linkWhileSignedIn.back': 'Retour au Dex',
  'linkWhileSignedIn.signOut': 'Se déconnecter et utiliser le lien',

  // Server unreachable
  'unreachable.title': 'Serveur injoignable',
  'unreachable.documentTitle': 'Hors ligne',
  'unreachable.retry': 'Réessayer',

  // Signing out
  'signOut.failed': 'Déconnexion impossible : ta session reste ouverte. {reason}',
  'password.tooGuessable': 'Trop facile à deviner. Choisis une phrase plus personnelle.',
  'api.unexpected': 'Quelque chose n’a pas marché. Réessaie dans un instant.',
  // @entries
} as const;

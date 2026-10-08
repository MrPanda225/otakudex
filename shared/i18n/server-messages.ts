import { fillMessage, lookupMessage, type BaseKey, type MessageParams } from './format.ts';
import type { Lang } from './lang.ts';

/**
 * Every sentence the server can say to a person: refusals, limits, problems on the way to Kitsu. The French text
 * is the reference (it is also what logs and tests read); the English text must have the same keys and the same
 * `{holes}`, which `tests/i18n.test.ts` checks. A message that depends on a count has a `.one` and a `.other` form.
 * Voice: short, calm, no blame, what to do next (docs/07-langues-et-textes.md).
 */
const fr = {
  'error.invalidRequest': 'Certaines valeurs ne conviennent pas. Vérifie le formulaire.',
  'error.badRequest': 'Requête invalide.',
  'error.internal': 'Une erreur est survenue. Réessaie dans un instant.',
  'error.routeNotFound': 'Route introuvable.',
  'error.pageNotFound': 'Page introuvable.',
  'error.hostNotAllowed': 'Hôte non autorisé.',
  'error.foreignOrigin': 'Requête refusée : elle ne vient pas de cette application.',

  'auth.loginRequired': 'Connecte-toi pour continuer.',
  'auth.loginFailed': 'E-mail ou mot de passe incorrect.',
  'auth.wrongSetupCode': 'Code de création incorrect.',
  'auth.accountExists': 'Un compte existe déjà. Connecte-toi.',
  'auth.emailTaken': 'Cet e-mail a déjà un compte. Connecte-toi.',
  'auth.invitationInvalid': 'Cette invitation n’est plus valable. Demande un nouveau lien à la personne qui t’a invité.',
  'auth.resetInvalid': 'Ce lien n’est plus valable. Demande-en un nouveau à l’administrateur.',
  'auth.currentPasswordWrong': 'Mot de passe actuel incorrect.',
  'auth.tooManyAttempts': 'Trop d’essais. Réessaie dans {wait}.',
  'auth.tooManyRequests': 'Trop de tentatives. Réessaie dans quelques minutes.',
  'auth.adminOnly': 'Réservé à l’administrateur.',

  'password.tooShort': '{min} caractères minimum (tu en as {count}).',
  'password.tooLong': '{max} caractères au maximum.',
  'password.tooGuessable': 'Trop facile à deviner. Choisis une phrase plus personnelle.',

  'admin.accountNotFound': 'Compte introuvable.',
  'admin.cannotDeactivateAdmin': 'Le compte administrateur ne peut pas être désactivé.',
  'admin.invitationNotPending': 'Cette invitation n’est plus en attente.',
  'admin.noAccountForEmail': 'Aucun compte avec cet e-mail.',
  'admin.noAdmin': 'Aucun compte administrateur.',

  'library.entryNotFound': 'Anime introuvable dans ton Dex.',
  'library.limitReached': 'Ton Dex est plein ({max} anime).',
  'library.alreadyIn': 'Cet anime est déjà dans ton Dex.',
  'library.notOnKitsu': 'Cet anime est introuvable sur Kitsu.',
  'library.allEpisodesSeen': 'Tous les épisodes sont déjà vus.',
  'library.episodeLimit': 'Limite atteinte : {max} épisodes pour cet anime.',
  'library.nothingToUndo': 'Aucun épisode à annuler.',
  'library.progressTooHigh.one': 'La progression ne peut pas dépasser {count} épisode.',
  'library.progressTooHigh.other': 'La progression ne peut pas dépasser {count} épisodes.',

  'ranking.notStarted': 'Tu ne peux classer qu’un anime que tu as commencé.',
  'ranking.badPosition': 'Position invalide.',

  'export.rankingIncomplete': 'Le fichier contient un classement incomplet.',
  'export.plannedRanked': 'Le fichier classe un anime encore « à voir ».',
  'export.rankingInconsistent': 'Le classement du fichier est incohérent : rangs manquants ou désordonnés.',
  'export.libraryNotEmpty': 'Ton Dex n’est pas vide : on ne restaure que dans un Dex vide.',

  'kitsu.unreachable': 'Impossible de joindre Kitsu. Réessaie dans un instant.',
  'kitsu.error': 'Kitsu a répondu avec une erreur ({status}). Réessaie plus tard.',
  'kitsu.badFormat': 'Kitsu a répondu de façon inattendue. Réessaie plus tard.',

  'poster.addressNotAllowed': 'Adresse d’image non autorisée.',
  'poster.formatUnsupported': 'Format d’image non pris en charge.',
  'poster.fetchFailed': 'Impossible de charger la couverture.',
  'poster.tooBig': 'Image trop volumineuse.',
  'image.notFound': 'Image introuvable.',
} as const;

export type ServerMessageKey = BaseKey<keyof typeof fr>;

const en: Record<keyof typeof fr, string> = {
  'error.invalidRequest': 'Some values don’t fit. Check the form.',
  'error.badRequest': 'Invalid request.',
  'error.internal': 'Something went wrong. Try again in a moment.',
  'error.routeNotFound': 'Route not found.',
  'error.pageNotFound': 'Page not found.',
  'error.hostNotAllowed': 'Host not allowed.',
  'error.foreignOrigin': 'Request refused: it doesn’t come from this app.',

  'auth.loginRequired': 'Sign in to continue.',
  'auth.loginFailed': 'Wrong e-mail or password.',
  'auth.wrongSetupCode': 'Wrong setup code.',
  'auth.accountExists': 'An account already exists. Sign in.',
  'auth.emailTaken': 'This e-mail already has an account. Sign in.',
  'auth.invitationInvalid': 'This invitation is no longer valid. Ask the person who invited you for a new link.',
  'auth.resetInvalid': 'This link is no longer valid. Ask the administrator for a new one.',
  'auth.currentPasswordWrong': 'Current password is wrong.',
  'auth.tooManyAttempts': 'Too many attempts. Try again in {wait}.',
  'auth.tooManyRequests': 'Too many attempts. Try again in a few minutes.',
  'auth.adminOnly': 'Administrator only.',

  'password.tooShort': 'At least {min} characters (you have {count}).',
  'password.tooLong': '{max} characters at most.',
  'password.tooGuessable': 'Too easy to guess. Pick a more personal phrase.',

  'admin.accountNotFound': 'Account not found.',
  'admin.cannotDeactivateAdmin': 'The administrator account can’t be deactivated.',
  'admin.invitationNotPending': 'This invitation is no longer pending.',
  'admin.noAccountForEmail': 'No account with this e-mail.',
  'admin.noAdmin': 'No administrator account.',

  'library.entryNotFound': 'Anime not found in your Dex.',
  'library.limitReached': 'Your Dex is full ({max} anime).',
  'library.alreadyIn': 'This anime is already in your Dex.',
  'library.notOnKitsu': 'This anime isn’t on Kitsu.',
  'library.allEpisodesSeen': 'All episodes are already watched.',
  'library.episodeLimit': 'Limit reached: {max} episodes for this anime.',
  'library.nothingToUndo': 'No episode to undo.',
  'library.progressTooHigh.one': 'Progress can’t go past {count} episode.',
  'library.progressTooHigh.other': 'Progress can’t go past {count} episodes.',

  'ranking.notStarted': 'You can only rank an anime you’ve started.',
  'ranking.badPosition': 'Invalid position.',

  'export.rankingIncomplete': 'The file has an incomplete ranking.',
  'export.plannedRanked': 'The file ranks an anime that is still “to watch”.',
  'export.rankingInconsistent': 'The file’s ranking is inconsistent: missing or out-of-order ranks.',
  'export.libraryNotEmpty': 'Your Dex isn’t empty: you can only restore into an empty Dex.',

  'kitsu.unreachable': 'Can’t reach Kitsu. Try again in a moment.',
  'kitsu.error': 'Kitsu returned an error ({status}). Try again later.',
  'kitsu.badFormat': 'Kitsu sent an unexpected answer. Try again later.',

  'poster.addressNotAllowed': 'Image address not allowed.',
  'poster.formatUnsupported': 'Unsupported image format.',
  'poster.fetchFailed': 'Can’t load the cover.',
  'poster.tooBig': 'Image too large.',
  'image.notFound': 'Image not found.',
};

export const SERVER_CATALOGUES: Record<Lang, Readonly<Record<string, string>>> = { fr, en };

/** The sentence for `key` in `lang`; the French one when the English is missing, the key itself as a last resort. */
export function serverMessage(key: ServerMessageKey, lang: Lang, params?: MessageParams): string {
  const text = lookupMessage(SERVER_CATALOGUES[lang], key, lang, params) ?? lookupMessage(fr, key, 'fr', params) ?? key;
  return fillMessage(text, params, lang);
}

import type { Lang } from '../../../shared/i18n/lang.ts';

/**
 * Kitsu names its genres in English. These are the ones the server keeps (`KEPT_GENRES`), in French. A genre
 * with no entry is shown as Kitsu wrote it: better English than a wrong guess. `tests/i18n.test.ts` checks that
 * every kept genre has its French form.
 */
export const FRENCH_GENRES: Readonly<Record<string, string>> = {
  action: 'Action',
  adventure: 'Aventure',
  comedy: 'Comédie',
  drama: 'Drame',
  fantasy: 'Fantastique',
  horror: 'Horreur',
  mystery: 'Mystère',
  romance: 'Romance',
  'sci-fi': 'Science-fiction',
  'slice of life': 'Tranche de vie',
  sports: 'Sport',
  supernatural: 'Surnaturel',
  thriller: 'Thriller',
  psychological: 'Psychologique',
  mecha: 'Mecha',
  music: 'Musique',
  historical: 'Historique',
  ecchi: 'Ecchi',
  magic: 'Magie',
  'school life': 'Vie scolaire',
  'martial arts': 'Arts martiaux',
  military: 'Militaire',
  police: 'Policier',
  parody: 'Parodie',
  space: 'Espace',
  'super power': 'Super-pouvoirs',
  vampire: 'Vampires',
  samurai: 'Samouraïs',
  game: 'Jeu',
  harem: 'Harem',
  cyberpunk: 'Cyberpunk',
  'post apocalypse': 'Post-apocalyptique',
  isekai: 'Isekai',
  survival: 'Survie',
  'time travel': 'Voyage dans le temps',
  detective: 'Détective',
  idol: 'Idoles',
  shounen: 'Shōnen',
  shoujo: 'Shōjo',
  seinen: 'Seinen',
  josei: 'Josei',
  kids: 'Enfants',
};

export function genreLabel(lang: Lang, genre: string): string {
  if (lang !== 'fr') return genre;
  const key = genre.toLowerCase();
  return Object.hasOwn(FRENCH_GENRES, key) ? (FRENCH_GENRES[key] ?? genre) : genre; // never "constructor" or "__proto__"
}

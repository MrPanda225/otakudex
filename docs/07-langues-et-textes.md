# Otakudex — Langues et textes

Ce document répond à une demande du propriétaire : une application qui parle simplement, sans se justifier à
chaque ligne, disponible en français et en anglais d'un seul bouton, avec des données de Kitsu qui suivent la
langue choisie ; plus un bouton « haut de page ». Les exigences sont FR-105 à FR-111 et NFR-58 à NFR-60
(`docs/01-exigences.md`).

## 1. Décisions

| Sujet | Décision | Raison |
|---|---|---|
| Langues | Français (par défaut) et anglais. | Le propriétaire écrit en français ; les amis peuvent être anglophones. |
| Bouton de langue | Sur chaque écran : coin supérieur droit des écrans d'accès, barre du haut dans l'application. Il affiche la langue vers laquelle on bascule (« EN » quand on lit le français). | Reconnaissance plutôt que rappel (Nielsen) ; un seul geste. |
| Fenêtre ouverte | Derrière une fiche ou une fenêtre (modale), le bouton est inerte comme tout le reste de la page : on ferme la fenêtre, puis on change. Si la langue change malgré tout (raccourci, outil), la fenêtre reste ouverte et son texte suit. | Comportement natif d'une fenêtre modale (focus et clics enfermés) ; ne pas le contourner. |
| Choix gardé | Sur l'appareil (`localStorage`). Premier lancement : anglais si le navigateur demande `en…`, français sinon. | Aucune donnée de compte de plus ; un ami garde sa langue d'un appareil à l'autre plus tard (voir §6). |
| Source des textes | Deux catalogues complets, un par langue, vérifiés par test (mêmes clés, mêmes paramètres). Aucun texte écrit en dur dans un composant. | Un texte oublié se voit au test, pas chez l'utilisateur. |
| Messages d'erreur du serveur | Le serveur lance une erreur portant une **clé** ; il répond dans la langue de l'en-tête `Accept-Language` envoyé par l'application, avec le `code` (la clé) à côté du `message`. | Le client ne compare plus jamais un texte (`startsWith('Requête invalide')` disparaît). |
| Titres d'anime | Jamais traduits : on garde le titre d'origine de Kitsu (rōmaji) ; la fiche montre aussi le titre anglais et japonais. | Kitsu ne fournit aucun titre français ; une traduction automatique d'un titre est fausse. |
| Genres, type, statut, classification | Dictionnaire fixe français/anglais (liste courte et connue). | Sûr, instantané, hors ligne, sans fournisseur. |
| Synopsis | Traduit par le serveur dans la langue choisie et gardé en base (une traduction par anime et par langue, partagée entre les comptes). Sans service configuré : texte d'origine, marqué « en anglais ». | Un synopsis ne change presque jamais : on le traduit une fois. |
| Bouton « haut de page » | Apparaît après un défilement notable, en bas à droite. | Demande du propriétaire ; pages longues (collection, statistiques). |

### Le service de traduction (synopsis)

Kitsu ne donne les synopsis qu'en anglais (vérifié : `synopsis`/`description` sans variante par langue ; les
titres existent en `en`, `en_jp`, `ja_jp` et quelques autres, jamais `fr`). Il faut donc un traducteur.

| Option | Qualité | Mise en place | Remarque |
|---|---|---|---|
| **DeepL API Free** (retenu en premier) | Très bonne | Un compte DeepL et une clé (`DEEPL_API_KEY`) ; 500 000 caractères par mois gratuits ([limites](https://developers.deepl.com/docs/resources/usage-limits)) | Un synopsis fait environ 700 caractères : ~700 anime traduits par mois, et chaque traduction est gardée. |
| **LibreTranslate** auto-hébergé | Correcte | Un conteneur sur le homelab, `LIBRETRANSLATE_URL` | Aucun compte, rien ne sort de chez toi. |
| Traducteur du navigateur (Chrome, `Translator`) | Bonne, sur l'appareil | Rien à installer, mais un modèle de langue à télécharger une fois | Seulement Chrome sur ordinateur, pas sur téléphone ; utilisé en **dernier recours** (FR-109). |
| Services non officiels (points d'accès non documentés) | – | – | **Écartés** : contraires aux conditions d'usage et à la règle « sources officielles ». |

Aucune clé n'est écrite dans le dépôt : `.env` seulement (déjà ignoré). L'application ne crée aucun compte à la
place du propriétaire. Le serveur n'envoie au traducteur que le texte public d'un synopsis, jamais une donnée de
compte.

Risques gardés en tête (relecture de sécurité indépendante du 2026-10-08) :

- Le texte d'un synopsis est écrit par la communauté Kitsu, donc **non fiable** : il est affiché comme du texte
  (jamais comme du HTML), limité à 4 000 caractères (coupés sur des caractères entiers, jamais au milieu d'un
  émoji), et la traduction est limitée de la même façon.
- **Seul un texte venu de Kitsu est envoyé au service** : un synopsis écrit par un membre dans un fichier importé
  (`raw` vide) ne l'est jamais, sinon un import de 150 anime aux synopsis de 4 000 caractères viderait le forfait
  gratuit du propriétaire.
- **Budget par heure, compté en caractères** (ce qui se vend) : 60 000 en tout et 20 000 par compte ; au-delà, le
  texte d'origine reste, sans appel au service.
- Un échec n'est jamais gardé. S'il vient **du service** (réseau, clé refusée, quota, erreur serveur), toute
  traduction s'arrête 5 minutes ; s'il vient **du texte** (le service l'a refusé), seul ce texte attend 5 minutes.
- Les redirections sont refusées (elles emporteraient le corps de la requête, clé comprise, vers une autre
  adresse) ; l'adresse de LibreTranslate ne peut pas contenir d'identifiants ; un démarrage avec une clé envoyée
  en `http` vers une autre machine affiche un avertissement.
- Une demande simultanée ne partage la réponse d'une autre que pour **le même texte** (la clé contient son
  empreinte).

## 2. Voix et ton

**Voix** (toujours la même) : calme, directe, chaleureuse, un peu malicieuse quand le sujet s'y prête (on parle
d'anime), jamais forcée. On tutoie.
**Ton** (change avec la situation) : léger quand on réussit quelque chose, posé quand quelque chose a raté,
sobre quand on supprime. (Mailchimp, *Voice and Tone* : la voix est constante, le ton suit l'état d'esprit du
lecteur.)

### Règles

1. **Dire une fois, court.** Retirer tout mot qui ne change pas ce que la personne fait. Lire à voix haute pour
   vérifier. (Apple HIG, *Writing* : « Be clear » ; Nielsen Norman Group : on lit en diagonale, l'essentiel
   d'abord.)
2. **Ne pas se justifier.** On dit ce que c'est ou ce qu'on peut faire, pas pourquoi l'application est faite
   ainsi. On n'explique que ce qui aide à décider (effet irréversible, limite à connaître). Pas de « pour ta
   sécurité », « afin de », « nous avons choisi de ».
3. **Un verbe sur les boutons, un lien qui tient sa promesse.** « Ajouter », « Se connecter » ; jamais « Cliquer
   ici ». (HIG : actions à l'infinitif ; Nielsen Norman Group : « a link is a promise ».)
4. **Les erreurs ne blâment pas.** Ce qui s'est passé, puis quoi faire, en une phrase. Pas de « Erreur : », pas de
   « Tu as oublié… ». (HIG : « avoid blame »; message avec le correctif.)
5. **Un mot par idée.** *Dex* (la bibliothèque d'une personne), *anime* (invariable), *épisode*, *À voir / En cours /
   Terminé / En pause / Abandonné*. Le glossaire du §3 fait foi. (HIG : « build language patterns ».)
6. **Majuscule de phrase partout** (seule la première lettre, plus les noms propres). Pas de MAJUSCULES pour crier.
7. **Possessifs avec parcimonie** : « Dex » plutôt que « Mon Dex » quand le contexte le dit déjà. (HIG.)
8. **Écrire pour la traduction** : phrases entières avec paramètres (jamais deux morceaux collés), pluriels
   explicites, pas de jeu de mots qui ne passe pas dans l'autre langue, prévoir 30 à 40 % de place en plus.
9. **Pas d'émoji comme information**, pas de ponctuation de cris (« !!! »). Un point d'exclamation au plus, pour
   une vraie réussite.
10. **Limite de longueur** : un message courant tient en 120 caractères ; au-delà, c'est qu'il explique
    trop (test : aucun texte du catalogue ne dépasse 160 caractères).

### Avant / après (textes réels de l'application)

| Avant | Après | Règle |
|---|---|---|
| Ton Dex sera à toi seul : l’application ne le montre à personne. | Ton Dex reste privé. | 1, 2 |
| Tu seras l’administrateur : toi seul pourras inviter des amis. | Premier compte : c’est toi qui invites les autres. | 1, 2 |
| 15 caractères ou plus. Une phrase que tu retiens fonctionne très bien. | 15 caractères ou plus : une phrase suffit. | 1 |
| Le code que la personne qui gère le serveur a défini (SETUP_CODE). | Code de création défini sur le serveur. | 1 |
| Ton Dex actuel (4 anime) sera rattaché à ce compte. | Tes 4 anime seront rattachés à ce compte. | 1, 7 |
| Le serveur ne répond pas. Vérifie qu’il est lancé (npm run dev). | Le serveur ne répond pas. Réessaie dans un instant. | 4 |
| Affiches des anime du moment · Kitsu | Affiches : Kitsu | 1 |
| Requête invalide : vérifie les valeurs envoyées. | Certaines valeurs ne conviennent pas. Vérifie le formulaire. | 4 |

## 3. Glossaire (les deux langues, un mot par idée)

| Idée | Français | English |
|---|---|---|
| La bibliothèque d'une personne | Dex | Dex |
| Un titre suivi | anime (invariable) | anime (invariable) |
| Mettre à jour son avancement | Marquer un épisode vu | Mark an episode as watched |
| Statuts | À voir, En cours, Terminé, En pause, Abandonné | To watch, Watching, Completed, On hold, Dropped |
| Goût (avant les duels) | Adoré, Bien, Bof | Loved, Liked, Meh |
| Paliers | Légendaire, Épique, Rare, Commun, Oubliable | Legendary, Epic, Rare, Common, Forgettable |
| Classement par duels | Arène, duel | Arena, duel |
| Tirage au sort | Ce soir | Tonight |
| Inviter un ami | Inviter, lien d'invitation | Invite, invitation link |

## 4. Architecture

```
shared/i18n/            langues, résolution de la langue d'une requête, pluriels, messages du serveur (fr, en)
server/errors.ts        AppError(clé, statut, paramètres) ; message = français, code = clé
server/translate/       service de traduction des synopsis, fournisseurs DeepL / LibreTranslate, cache en base
web/src/i18n/           contexte, t() et tn(), formats (dates, nombres, durées), dictionnaires de genres
web/src/i18n/messages/  fr/access.ts, fr/app.ts, en/access.ts, en/app.ts
```

- Les écrans d'accès n'embarquent que `access` de la langue active ; `app` n'arrive qu'avec l'application
  (budget du premier fichier, NFR-55). Changer de langue charge l'autre catalogue puis remplace le texte d'un
  coup : rien ne se recharge, aucune saisie ni fenêtre ouverte n'est perdue.
- `t('clé', { nom })` pour une phrase ; `tn('clé', nombre, { … })` pour un pluriel (`Intl.PluralRules`, clés
  `clé.one` / `clé.other`).
- Dates, nombres et durées passent par `Intl` avec la langue active (jj/mm/aaaa en français, mmm j, aaaa en
  anglais).
- Le CSV exporté suit la langue de la page (paramètre `?lang=` du lien de téléchargement, qui ne peut pas envoyer
  d'en-tête) ; le JSON d'export, lui, ne change jamais (format de restauration).
- Les messages affichés par la ligne de commande côté serveur (`npm run admin:reset-link`, avertissements de
  démarrage) restent en français : ils s'adressent à celui qui tient le serveur.

## 5. Bouton « haut de page »

Cercle de 44 px, en bas à droite (marge de zone sûre sur téléphone), flèche vers le haut, libellé « Haut de
page » / « Back to top ». Il apparaît après un défilement de plus d'un écran et demi, remonte en douceur (instantané
si le système demande de réduire les animations), puis rend le focus au premier élément de la page. Il ne couvre
pas le contenu des fenêtres ouvertes (absent quand une fenêtre est ouverte) et n'existe pas sur les écrans
d'accès (pas de défilement).

## 6. Pour la suite

- La langue pourrait être gardée dans le compte (une colonne), pour la suivre d'un appareil à l'autre ; non
  retenu maintenant pour ne pas toucher au schéma sans besoin.
- D'autres langues : ajouter deux fichiers par langue et un test de parité suffit.

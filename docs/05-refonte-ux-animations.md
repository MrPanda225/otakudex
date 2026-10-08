# Otakudex — Refonte : navigation fluide, animations, tableaux de bord

Document de conception de la version 2 de l'interface. Il applique le guide UX (chaque point nomme son
principe) et le guide des tableaux de bord (Few, Tufte, Ware, Sweller, Kaushik) avant tout code.
Complète [02-ux-ui.md](02-ux-ui.md) ; les exigences correspondantes sont dans
[01-exigences.md](01-exigences.md) (FR-62 à FR-69, NFR-27 à NFR-32). La section 7 traite la fiche d'un
anime (FR-70 à FR-79, NFR-33 à NFR-35).

## 1. Contexte (protocole UX)

| Question | Réponse |
|---|---|
| Qui ? | Le propriétaire, seul utilisateur, plusieurs fois par semaine. |
| Travail à accomplir | « Noter ce que je viens de regarder en une seconde, voir si j'avance, savoir quoi regarder ensuite. » |
| Où dans le parcours ? | Incorporation (Karaponos) : l'usage devient un réflexe ; l'identification passe par le classement et les stats. |
| Plateforme | Web, PC d'abord, téléphone ensuite. |
| Demande du propriétaire | Navigation fluide, peu de surcharge cognitive, animations dynamiques avec anime.js, graphiques de progression conçus avec le guide des tableaux de bord. |

## 2. Audit de l'interface actuelle

Format : problème → principe violé → correction.

| # | Problème constaté | Principe | Correction |
|---|---|---|---|
| 1 | Le Dex affiche recherche, genre, tri et six pastilles de statut avant la moindre couverture. Sur téléphone, les filtres occupent la moitié de l'écran. | **Charge cognitive extrinsèque**, **loi de Hick**, **Pareto** : le critique (continuer ce que je regarde) est noyé. | Le Dex s'ouvre sur « Continuer » (anime en cours, action principale géante), puis la collection. Un seul rang d'onglets de statut ; genre et tri passent dans « Filtrer et trier » (**divulgation progressive**). |
| 2 | Marquer un épisode attend la réponse du serveur : le retour visuel dépasse 100 ms avec une base distante (Neon). | **Fogg** (capacité), règle des 100 ms. | Mise à jour **optimiste** : l'écran change tout de suite, le serveur confirme, l'écran revient en arrière avec un message en cas d'échec. |
| 3 | Chaque changement de page démonte tout : « Chargement… » à chaque retour, filtres et défilement perdus. | **Karaponos** (orientation), **reconnaissance plutôt que rappel**, règle « conserver l'état au retour ». | Les dernières données connues s'affichent aussitôt (**stale-while-revalidate**), puis se rafraîchissent. Filtres, onglets et défilement sont conservés pour la session. |
| 4 | Aucune transition : la page change d'un coup, on perd le fil de ce qui a bougé. | **Orientation spatiale**, **Peak-End** (le ressenti de fluidité), **effet esthétique-utilisabilité**. | Entrée de page en fondu et glissement court, indicateur d'onglet qui glisse, apparition échelonnée des éléments, sorties rapides des fenêtres. |
| 5 | L'Arène place « À classer » (liste complète) avant le classement lui-même. | **Kairos**, **Hook** (l'action d'investissement doit être évidente, pas écrasante). | Un seul appel à l'action : « Prochain duel » pour l'anime le plus récent à classer ; les autres dans une liste repliée. Le classement reste le contenu principal (**hiérarchie**, Wurman). |
| 6 | Les Stats montrent 5 cartes, 5 types de graphique et 5 couleurs de statut. Les chiffres n'ont pas de repère (« 307 » : bien ou mal ?). | Pièges BI n° 1, 2, 5, 6, 8, 10 : plus d'un écran, pas de contexte, trop de variété, trop de points focaux, abus de couleur. | Deux vues (**Aperçu**, **Détails**) ; 4 indicateurs avec comparaison ; un seul accent ; barres et lignes seulement (voir section 4). |
| 7 | Le bouton « ⋯ » n'a qu'une icône pour ouvrir l'export. | **Reconnaissance**, **information scent**. | Libellé visible « Données » à côté de l'icône sur PC. |
| 8 | Après avoir classé, la fenêtre se ferme sans montrer ce qui a changé dans la liste. | **Peak-End** (la fin compte autant que le pic). | Le classement défile jusqu'à l'anime et sa ligne s'illumine brièvement. |
| 9 | Aucun focus clavier ni annonce lors d'un changement de page. | **WCAG 2.4.3 / 4.1.3**, accessibilité de navigation. | Le focus va au titre de la page ; le titre du document change. |

### Ce qui reste, parce que ça marche

- Barre de navigation à 4 destinations (≤ 5, **loi de Hick**), action « Ajouter » toujours accessible.
- Célébration à la fin d'un anime puis proposition de le classer (**Kairos**, **Peak-End**).
- États vides avec une seule action (**Karaponos**, orientation).

## 3. Architecture de chaque page

### Dex (axe : catégorie, **Wurman**)

```
Mon Dex                                   [ Rechercher… ]
── Continuer ────────────────────────────────────────────
[ affiche  Titre            ]  [ affiche  Titre            ]
[          Ép. 19 sur 28    ]  [          Ép. 9 sur 25     ]
[          ▓▓▓▓▓░░  reste 3 h]  [          ▓▓░░░░  reste 6 h]
[          ( Épisode suivant )]  [          ( Épisode suivant )]
── Collection ───────────────────────────────────────────
( Tous 14 ) À voir 4   Terminé 6   En pause 1   Abandonné 1     Filtrer et trier ▾
[ mur de couvertures ]
```

- « Continuer » n'existe que s'il y a des anime en cours ; sinon la collection prend la place.
- L'action principale d'une carte « Continuer » mesure au moins 48 px de haut et porte un libellé ;
  celles de la collection restent des boutons « + » compacts.
- Le temps restant (épisodes restants × durée) répond à « combien me reste-t-il ? » sans calcul mental.

### Arène (axe : hiérarchie)

```
Arène                                     ( Classement | Tiers )
┌ Prochain duel ───────────────────────────────────────┐
│ [affiche] Frieren attend sa place         ( Lancer )  │   ← seulement s'il y a des anime à classer
│ 3 autres à classer ▾                                   │
└──────────────────────────────────────────────────────┘
 1  [affiche] Steins;Gate                      S  100
 2  …
```

### Stats (inversion de pyramide, **Few**)

Voir section 4.

### Ce soir (axe : hiérarchie pondérée)

Critères et bouton à gauche, résultat à droite. Pendant le tirage, les couvertures défilent ; le
résultat apparaît avec un ressort court. Aucun changement de structure.

## 4. Tableau de bord Stats (guide BI)

**Type : stratégique** (lecture en quelques minutes, une personne). **Décision soutenue** : « Dois-je
regarder plus, et quoi ? » (action, **Kaushik**), et non « quelles données existent ? ».

**Modèle de lecture : pyramide inversée** (indicateurs → tendance → détail), avec le plus important en
haut à gauche (**Few**, **Ware**).

### Vue « Aperçu » (un écran)

| Zone | Contenu | Graphique et justification |
|---|---|---|
| 4 indicateurs | **7 derniers jours** (épisodes, comparés aux 7 jours précédents, mini-courbe des 12 dernières semaines) · **Reste à voir** (heures ; « ≈ N semaines à ton rythme ») · **Série** (semaines d'affilée, record) · **Temps regardé** (cumul) | Nombre + repère (piège n° 2 : jamais de chiffre seul). Mini-courbe = ligne, une seule (**connexion**, Gestalt). |
| Tendance | Épisodes par semaine sur 26 semaines, moyenne mobile sur 4 semaines | **Diagramme en barres**, axe à zéro (règle absolue). Barres grises, semaine en cours en accent. Ligne de moyenne en pointillé gris. Étiquettes directes sur la meilleure semaine et la semaine en cours : pas de légende (**Tufte**, rapport données/encre). |
| Progression du Dex | Nombre d'anime par statut | **Diagramme en barres horizontales** triées (comparer des catégories). Gris sauf « En cours » en accent : l'accent signale « ce qui est actif ». Valeurs écrites au bout des barres. |

### Vue « Détails »

| Zone | Contenu | Graphique et justification |
|---|---|---|
| Régularité | Carte de chaleur des 52 semaines | Carte de chaleur à une seule teinte (variable numérique ordonnée : palette **mono-teinte**). |
| Tes notes | Répartition par tranche de 10 | Histogramme gris, ligne verticale de la moyenne avec son étiquette (repère). |
| Genres | Dix genres les plus regardés | Barres horizontales grises triées, le premier en gras. |

### Règles transversales

- **Un seul accent** par vue (**Von Restorff**) : l'accent veut dire « actif maintenant » (semaine en
  cours, anime en cours). Tout le reste est gris ou encre (le gris est l'outil principal).
- Pas de rouge/vert pour les variations : flèche et texte (« +3 », « −2 », « = ») avec l'encre ; la
  couleur ne porte jamais seule l'information (daltonisme, WCAG 1.4.1).
- Aucun 3D, aucun camembert (plus de 3 catégories), maximum 4 lignes par graphique, aucune ombre ni
  dégradé dans les graphiques (pas de décoration).
- Chaque graphique a un titre qui dit ce qu'il montre, un résumé en texte pour les lecteurs d'écran
  et des valeurs accessibles (titre SVG de chaque barre).
- Mêmes couleurs pour les mêmes choses sur toutes les pages (statut, tier).

### Définitions des indicateurs

| Indicateur | Définition |
|---|---|
| 7 derniers jours | Épisodes horodatés des 7 derniers jours civils, jour courant compris. Comparé aux 7 jours précédents. |
| Rythme | Épisodes horodatés des 28 derniers jours divisés par 4 (épisodes par semaine). |
| Reste à voir | Somme, pour les anime « à voir », « en cours » et « en pause » dont le nombre d'épisodes et la durée sont connus, des épisodes restants × durée. Les autres sont comptés à part. |
| Estimation | Épisodes restants ÷ rythme, en semaines arrondies à l'entier supérieur ; absente si le rythme est nul. |
| Série | Semaines consécutives avec au moins un épisode ; la semaine en cours ne casse pas la série tant qu'elle n'est pas finie. |

## 5. Mouvement (anime.js)

Bibliothèque : [anime.js](https://animejs.com) 4 (licence MIT). Règles issues du guide UI :
150 à 300 ms pour les micro-interactions, 400 ms au plus pour les enchaînements ; **transform et
opacity seulement** (la progression est une mise à l'échelle, pas une largeur) ; entrée en sortie
rapide (*ease-out* à l'entrée, *ease-in* à la sortie) ; jamais d'animation décorative : chacune dit ce
qui vient de changer (**cause et effet**) ; interruptible ; ne bloque aucune saisie ; neutralisée par
`prefers-reduced-motion` (l'état final apparaît aussitôt).

| Moment | Élément | Mouvement | Durée | Pourquoi |
|---|---|---|---|---|
| Changement de page | Contenu de la page | Fondu + glissement de 12 px | 260 ms | Orientation : on voit qu'on est ailleurs |
| Changement de page | Cartes, lignes, panneaux | Apparition échelonnée (30 ms d'écart, 360 ms au plus au total) | 260 ms | Guide l'œil de haut en bas |
| Onglets (navigation, statut, vue) | Pastille active | Glissement vers l'onglet choisi | 280 ms | Montre d'où l'on vient |
| Épisode marqué | Bouton | Appui élastique | 220 ms | Retour immédiat |
| Épisode marqué | Barre de progression | Mise à l'échelle vers la nouvelle valeur | 380 ms | Montre l'avancée |
| Épisode marqué | Compteur « 5 / 12 » | Décompte numérique | 380 ms | Lie l'action au chiffre |
| Épisode marqué | Pastille « +1 » | Monte et disparaît | 600 ms | Récompense légère |
| Anime terminé | Carte | Pulsation + confettis (existants) | 400 ms | Pic émotionnel (Peak-End) |
| Ouverture d'une fenêtre | Fenêtre | Montée + mise à l'échelle (ressort) ; tiroir : glissement horizontal | 260 ms | Le contexte reste lisible |
| Fermeture d'une fenêtre | Fenêtre | Descente rapide | 160 ms | Sortie plus brève que l'entrée |
| Duel | Les deux cartes | Entrée par les côtés ; le vainqueur grossit, l'autre s'estompe | 220 ms | Cause et effet du choix |
| Résultat du classement | Rang | Décompte jusqu'au rang, carte qui se retourne, badge de tier qui apparaît | 700 ms | Pic de l'expérience |
| Classement mis à jour | Ligne de l'anime | Surbrillance qui s'estompe | 900 ms | Retrouver ce qui a changé |
| Stats | Chiffres | Décompte numérique | 600 ms | Attire l'œil sur les valeurs |
| Stats | Barres, carte de chaleur | Barres qui poussent depuis le zéro ; cellules qui apparaissent depuis aujourd'hui | 500 ms | Montre le sens de lecture |
| Notification | Toast | Montée + fondu ; sortie en fondu | 220 ms | Visible sans surprise |
| Tirage « Ce soir » | Dé et couverture | Rotation pendant le tirage, ressort à l'arrivée | 1 200 ms | Variable reward (Hook) |

## 6. Données supplémentaires pour les indicateurs

L'API de statistiques ajoute `backlogEpisodes`, `backlogMinutes` et `backlogUnknownCount`. Les séries
hebdomadaires, moyennes mobiles, comparaisons et estimations sont calculées côté client à partir de la
carte de chaleur (364 jours) par des fonctions pures testées.

## 7. Fiche d'un anime (tiroir)

Appliqué à la fiche qui s'ouvre depuis une carte ou une ligne du classement. Sources : guide UX
(Pareto, Hick, Fogg, divulgation progressive, Peak-End), guide UI (WCAG d'abord, puis MD3 et HIG).
Exigences : FR-70 à FR-79, NFR-33 à NFR-35.

### 7.1 Contexte

| Question | Réponse |
|---|---|
| Travail à accomplir | « Je viens de regarder un épisode : l'enregistrer d'un geste, voir où j'en suis. » Rarement : corriger une date, écrire une note, retirer l'anime. |
| Fréquence | Marquer un épisode : très fréquent. Changer le statut : fréquent. Dates, revisionnages, note : rare (**Pareto** : le critique 20 % est le suivi). |
| Plateforme | Tiroir à droite sur PC (520 px), plein écran sur téléphone. Web, WCAG 2.2 AA (**WCAG** prime, puis **MD3**). |

### 7.2 Audit de la fiche actuelle

Format : problème → principe violé → correction.

| # | Problème constaté | Principe | Correction |
|---|---|---|---|
| 1 | Tout est affiché d'un coup : statut, progression avec deux boutons, deux dates, revisionnages, note, deux actions. Neuf contrôles avant le premier défilement. | **Charge cognitive**, **loi de Hick**, **Pareto**, **divulgation progressive** | Une zone « Suivi » (statut, progression). Dates, revisionnages, correction de progression et note passent dans « Détails », replié. Son résumé d'une ligne montre ce qui est rempli (**reconnaissance** plutôt que rappel). |
| 2 | Les dates s'affichent en `mm/jj/aaaa` (format du navigateur) dans une application en français. | Cohérence avec la langue de l'utilisateur ; **WCAG 3.3.2** (étiquettes et instructions) | Champ texte `jj/mm/aaaa` avec masque (le pavé numérique du téléphone n'a pas de barre oblique), bouton « Aujourd'hui », message d'erreur avec exemple. |
| 3 | Le statut est une liste déroulante qui cache cinq choix. | **UI** : liste déroulante seulement au-delà de 6 à 7 options ; **reconnaissance** | Cinq pastilles visibles, choix exclusif, flèches du clavier (groupe de boutons radio natifs), pastille active qui glisse. |
| 4 | La progression est un champ numérique avec deux boutons qui passent à la ligne ; « Annuler le dernier » est hachuré dès 0. | **Fogg** (capacité), un seul bouton primaire par écran (**UI**), états désactivés | Compteur « 5 / 13 », barre, temps restant. Action primaire « Vu : épisode 6 » épinglée en bas (zone du pouce, **loi de Fitts**). Le « − » n'apparaît que s'il y a quelque chose à annuler. La saisie libre passe dans « Détails » sous le nom « Corriger ». |
| 5 | Le titre, en police d'affichage, tient sur trois lignes dans l'en-tête, puis revient dans le corps. | **Charge extrinsèque**, échelle typographique (**MD3**) | Titre en police de texte, deux lignes au plus, en-tête fin. |
| 6 | Le synopsis, qui ne sert pas à la tâche, pousse tout vers le bas. | **Pareto**, divulgation progressive | Trois lignes puis « Lire la suite ». |
| 7 | « Enregistré. » s'affiche loin du champ modifié, et l'écran attend le serveur. | **Visibilité de l'état du système** (Nielsen), règle des 100 ms, proximité (Gestalt) | Mise à jour optimiste ; « Enregistré » à côté du champ ; en cas d'échec, la valeur du serveur revient avec un message. |
| 8 | La note n'est enregistrée qu'à la sortie du champ : Échap ou un clic à côté perd la frappe. | **Prévention des erreurs** | Enregistrement 600 ms après la dernière frappe, à la sortie du champ et à la fermeture. |
| 9 | Repasser à « À voir » un anime classé supprime son rang sans prévenir. | **Prévention des erreurs**, action destructrice | Confirmation en ligne qui dit ce qui sera perdu. |
| 10 | Passer à « En cours » ou « Terminé » laisse les dates vides. Corriger la progression à 8 sur un anime « À voir » le laisse « À voir ». | **Design anticipatif** (Shapiro : forte probabilité d'avoir raison, coût d'erreur faible), **Fogg** (capacité) | Dates du jour remplies si elles sont vides, jamais écrasées ; la progression corrigée met le statut à jour. Tout reste modifiable. |
| 11 | Une valeur invalide (progression hors limites) est ignorée sans message. | **WCAG 3.3.1** (identification des erreurs) | Message sous le champ avec la plage permise, annoncé aux lecteurs d'écran. |
| 12 | La confirmation de retrait n'a pas le focus. | **WCAG 2.4.3** (ordre du focus) | Le focus va sur « Garder » (le choix sûr). |

### 7.3 Composition

```
┌ Clevatess II: Majuu no Ou to … (2 lignes max)      (X) ┐   ← en-tête fin, titre en police de texte
│ [affiche]  Série · 2026 · 13 ép. · 24 min               │
│ [  96 px ] Clevatess 2 (titre anglais)                  │
│ [        ] Action, Fantasy, Adventure                   │
│ [        ] Pas encore classé   ( Classer )  | A #3 82/100 ( Reclasser )
│ Synopsis sur trois lignes… Lire la suite                │
│ ┌ Suivi ─────────────────────────────────────────────┐ │
│ │ Statut  (À voir)(En cours)(Terminé)(En pause)(Abandonné) │
│ │ Progression                          reste 5 h 12   │ │
│ │ 5 / 13  (−)                                         │ │
│ │ ▓▓▓▓▓░░░░░░░░░░░░░░░░ 38 %                          │ │
│ └─────────────────────────────────────────────────────┘ │
│ ▸ Détails   Commencé le 3 oct. 2026 · Note              │   ← replié
│ ───────────────────────────────────────────────────────  │
│ Retirer du Dex                                          │
├─────────────────────────────────────────────────────────┤
│ ( ✓ Vu : épisode 6 )                                    │   ← pied du tiroir, toujours visible
└─────────────────────────────────────────────────────────┘
```

« Détails » déplié contient, dans cet ordre : **Commencé le**, **Terminé le** (seulement si l'anime
est terminé ou si une date existe), **Revisionnages** (− valeur +), **Corriger la progression**
(« Épisodes vus », sans historique), **Note privée**.

### 7.4 Action primaire selon l'état (un seul bouton primaire)

| État | Pied du tiroir | Dans l'en-tête de la fiche |
|---|---|---|
| Il reste des épisodes et le statut n'est pas « Terminé » (y compris « À voir ») | « Vu : épisode N » | « Classer » en discret si l'anime n'est pas « À voir » et pas classé |
| Terminé, pas classé | « Classer » | « Pas encore classé » |
| Terminé, classé | aucun | rang, note, « Reclasser » en discret |
| « À voir » | « Vu : épisode 1 » | « Commence-le pour pouvoir le classer. » |

### 7.5 Règles de comportement

- Chaque changement s'affiche tout de suite et part au serveur dans l'ordre ; seule la dernière
  réponse remplace l'écran (même mécanique que « Vu : épisode N », partagée dans `actions.ts`).
- Passer à « En cours » renseigne la date de début si elle est vide. Passer à « Terminé » renseigne les
  dates de début et de fin vides, et le serveur marque tous les épisodes comme vus.
- Corriger la progression à N (le nombre d'épisodes connu) passe l'anime à « Terminé » ; une valeur
  inférieure à N sur un anime « Terminé » le repasse à « En cours » ; une valeur positive sur un anime
  « À voir » le passe à « En cours ». Aucune ligne d'historique n'est créée, donc la carte de chaleur ne
  change pas.
- Les cinq statuts s'affichent trois par ligne (le parcours habituel d'abord, les deux exceptions en
  dessous) : aucune pastille ne reste seule sur une ligne étirée.
- Repasser à « À voir » un anime classé exige une confirmation (le rang est perdu, les autres remontent).
- Une date fausse, ou une fin avant le début, ne part pas au serveur : le champ garde ce qui a été tapé,
  l'erreur est écrite dessous avec un exemple.
- L'état ouvert ou fermé de « Détails » est gardé pour la session.

### 7.6 Mouvement de la fiche

Toujours via `web/src/motion/` ; mêmes règles qu'en section 5 (**NFR-33** : `transform` et `opacity`
seulement).

| Moment | Élément | Mouvement | Durée | Pourquoi |
|---|---|---|---|---|
| Ouverture | Barre de progression | Pousse depuis zéro | 380 ms | La situation se lit d'un coup d'œil |
| Changement de statut | Pastille active | Glisse vers la pastille choisie | 280 ms | Montre d'où l'on vient |
| « Vu : épisode N » | Bouton, compteur, barre, « +1 » | Appui élastique, décompte, mise à l'échelle, pastille qui monte | 220 à 600 ms | Cause et effet (réutilise les composants des cartes) |
| Dernier épisode vu | Pied du tiroir | « Classer » arrive avec un ressort | 400 ms | Peak-End : la suite logique se présente |
| Ouverture de « Détails » | Champs | Apparition échelonnée (opacité, glissement), hauteur non animée | 260 ms | Montre ce qui vient d'apparaître |
| Champ enregistré | Mention « Enregistré » | Entrée de 6 px puis fondu après 2 s | 220 ms puis 160 ms | Confirmation près du champ |
| Confirmation de retrait ou de perte de rang | Bloc de confirmation | Ressort court | 400 ms | Attire l'œil sans bloquer |

### 7.7 Accessibilité

- Statut : `fieldset` et `legend`, boutons radio natifs (flèches du clavier, Espace), focus visible sur
  la pastille entière (**WCAG 2.4.7**).
- Compteur : le texte du décompte est masqué aux lecteurs d'écran ; une zone `role="status"` annonce
  « Épisode 6 sur 13 » une fois (**NFR-35**).
- Erreurs : `role="alert"`, `aria-invalid`, `aria-describedby` vers le message (**WCAG 3.3.1**) ; l'erreur
  est écrite avec une icône, jamais seulement en rouge (**WCAG 1.4.1**).
- Cibles de 44 px minimum (« − », « + », pastilles, « Aujourd'hui »), 375 px sans défilement horizontal
  (**NFR-34**), marges de zone sûre en bas du tiroir plein écran.
- `prefers-reduced-motion` : chaque animation cède la place à l'état final (déjà garanti par le module).

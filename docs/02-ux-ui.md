# Otakudex — UX et UI

Chaque décision cite le modèle ou la règle qui la justifie. Sources UX : Fogg, Hook (Eyal), Kano,
Pareto, Peak-End (Kahneman), Karaponos, Wurman. Sources UI : WCAG 2.2 (source principale pour le
web), Material Design 3 (source secondaire).

> La version 2 de l'interface (zone « Continuer », tableaux de bord, animations) est conçue dans
> [05-refonte-ux-animations.md](05-refonte-ux-animations.md), qui complète ce document.

## 1. Contexte utilisateur

| Question | Réponse |
|---|---|
| Qui ? | Une seule personne, le propriétaire. Fan d'anime, à l'aise avec la technique. |
| Quel travail à accomplir ? | « Quand je finis un épisode, je veux le consigner en une seconde, pour sentir que j'avance et garder un classement juste de ce que j'ai vu. » |
| Où dans le parcours ? | Rétention (usage hebdomadaire), pas d'acquisition. L'accueil initial compte une fois. |
| Plateforme | Web, PC d'abord, lisible sur téléphone (375 px minimum). |
| Contraintes | Aucune donnée vers des tiers ; pas de notification en v1. |

On ne déduit pas les besoins de l'interface : ils viennent de l'étude (frictions de saisie, notes
arbitraires, absence d'export) et des quatre réponses de l'utilisateur.

## 2. Diagnostic UX

### Fogg : motivation, capacité, déclencheur

Le point faible d'un tracker est la **capacité** (saisie fastidieuse), pas la motivation. Les
utilisateurs arrêtent de consigner à cause de la saisie manuelle et de la culpabilité du backlog.

- **Capacité** : « +1 épisode » est un bouton unique sur chaque carte « en cours » du Dex (NFR-04).
  Raccourci « / » pour l'ajout (FR-61). Aucune confirmation sur les actions réversibles : on propose
  « annuler » à la place (FR-07).
- **Déclencheur** : sans notification en v1, le déclencheur est interne (« je viens de finir un
  épisode »). Le Dex s'ouvre sur les anime « en cours », donc l'action suit le déclencheur sans détour.
- **Motivation** : portée par le retour visible (rang, stats, heatmap), pas par des textes incitatifs.

### Hook (Eyal) : trigger, action, récompense variable, investissement

| Phase | Mécanique dans Otakudex |
|---|---|
| Trigger | Interne : fin d'un épisode, envie de choisir le suivant |
| Action | +1 en un geste ; recherche à la frappe |
| Récompense variable | Duels dont l'issue surprend, tirage « Ce soir », révélation du rang, bilan annuel |
| Investissement | Chaque duel, note privée et épisode horodaté enrichit le classement et les stats |

Le classement est l'investissement qui rend l'app plus précieuse avec le temps : on ne le perd pas.

### Kano : où concentrer l'effort

| Catégorie | Fonctions |
|---|---|
| Attendues (absence = déception) | Recherche et ajout, +1 épisode, statuts, persistance, export |
| Linéaires (mieux = plus de satisfaction) | Filtres et tri, statistiques, vitesse d'affichage |
| Attractives (différenciantes) | Duels et classement, tier list, carte de chaleur, tirage « Ce soir », célébration, bilan annuel |
| Neutres | Thèmes multiples, réglages avancés (non construits) |

Règle : les attractives ne compensent jamais une attendue absente. Ordre de construction :
attendues, puis classement, puis le reste.

### Pareto : les 20 % critiques

Marquer un épisode, ajouter un anime, classer un anime. Tout le reste est caché derrière une
divulgation progressive : détails d'une entrée dans un tiroir, filtres secondaires dans un menu. La fiche du tiroir est détaillée dans [05-refonte-ux-animations.md](05-refonte-ux-animations.md), section 7.

### Peak-End (Kahneman) : deux moments à soigner

- **Pic** : quand un anime passe à « terminé » (FR-60), la carte se retourne, une animation brève
  s'affiche, puis l'app propose « Classer maintenant ? » (kairos : on demande au moment du succès).
- **Fin** : à la fin des duels, l'écran affiche le rang obtenu et la note (« Entre #12 avec 83/100 »)
  avec la position dans le classement visible.

### Karaponos : trois phases d'adoption

1. **Orientation** : état vide soigné avec une seule action (« Ajouter ton premier anime »), sans tutoriel.
2. **Incorporation** : le Dex et le +1 deviennent un réflexe quotidien.
3. **Identification** : le classement et le bilan annuel donnent à l'utilisateur un portrait de ses goûts.

### Biais et éthique

- **Aversion à la perte** : pas de série (« streak ») punitive ni de compteur de retard culpabilisant.
  La série mesurée est en **semaines** avec au moins un épisode, et ne se perd pas de façon visible.
- **Aucun dark pattern** : aucune relance, aucune urgence artificielle.
- **Charge cognitive** : privilégier la reconnaissance (couvertures visibles) au rappel (champs vides).

### Architecture de l'information (Wurman)

| Écran | Axe d'organisation | Justification |
|---|---|---|
| Dex | **Catégorie** (statut) | On cherche « ce que je regarde » ou « ce que j'ai terminé » |
| Arène et classement | **Hiérarchie** (rang) | Le rang est l'information |
| Stats et carte de chaleur | **Temps** | Évolution et régularité |
| Ce soir | **Hiérarchie pondérée** (hasard guidé) | Un seul résultat à la fois |

### Test de qualité UX

Face à l'app sans instruction, l'utilisateur sait-il quoi faire, pourquoi, et se sent-il bien après ?
Dex vide : un seul bouton visible « Ajouter ». Dex rempli : les « en cours » sont en tête avec +1.

## 3. Parcours principaux

```
Ajouter   /  →  tape le titre  →  résultats (couverture, année, épisodes)  →  statut  →  carte dans le Dex
Marquer   Dex  →  +1  →  progression et horodatage  →  (dernier épisode) célébration  →  « Classer ? »
Classer   compartiment  →  duels (lequel est mieux ?)  →  rang et note  →  classement
Choisir   Ce soir  →  filtres (durée, type)  →  tirage  →  « Commencer »  →  statut « en cours »
Sauver    Réglages  →  Exporter JSON  →  fichier
```

## 4. Navigation

Quatre destinations plus une action (MD3 : barre de navigation basse limitée à 5 éléments, sur
mobile ; barre latérale ou supérieure sur PC) :

| Destination | Contenu |
|---|---|
| **Dex** | Mur de couvertures, filtres, +1 |
| **Arène** | Classement, tier list, duels |
| **Stats** | Chiffres, distribution, genres, carte de chaleur |
| **Ce soir** | Tirage au sort pondéré |
| **+ Ajouter** (action) | Recherche Kitsu en superposition, ouvrable par « / » |

Export et réglages vivent dans un menu secondaire, jamais dans la navigation principale (Pareto).
L'état actif est marqué par la couleur **et** un indicateur de forme (WCAG 1.4.1 : jamais la couleur seule).

## 5. Identité visuelle

**Concept : le Dex est un classeur de cartes.** Chaque anime est une carte ; sa tier est sa rareté.
Traitement « planche de manga » : bordures d'encre épaisses, ombres décalées dures, points de
trame discrets. Le parti pris visuel est concentré sur les cartes et l'Arène ; le reste reste calme.

Règle 60-30-10 : 60 % neutres teintés, 30 % cobalt, 10 % accents (surligneur jaune pour la rareté
élevée, rose sakura pour les moments de célébration).

### Jetons de couleur (sémantiques, jamais de valeur brute dans les composants)

| Jeton | Clair | Sombre | Usage |
|---|---|---|---|
| `--bg` | `#f4f5fb` | `#0f1020` | Fond de page |
| `--surface` | `#ffffff` | `#191a33` | Cartes, panneaux |
| `--ink` | `#14152b` | `#eef0ff` | Texte principal et bordures |
| `--muted` | `#585b76` | `#a3a7cf` | Texte secondaire |
| `--accent` | `#3a46ff` | `#8a93ff` | Actions principales, liens |
| `--on-accent` | `#ffffff` | `#0f1020` | Texte sur accent |
| `--highlight` | `#ffd93d` | `#ffd93d` | Tier S, surlignage |
| `--sakura` | `#ff6b9d` | `#ff7fad` | Célébration, tier A |
| `--success` | `#17805a` | `#46d39a` | État réussi (avec icône) |
| `--danger` | `#c8213f` | `#ff7a8f` | Action destructrice (avec icône) |

Contrastes visés : `--ink` sur `--bg` supérieur à 14:1 ; `--muted` sur `--bg` supérieur à 5:1 ;
`--on-accent` sur `--accent` supérieur à 4,5:1. Le mode sombre n'est pas une inversion : valeurs
désaturées et testées séparément. Aucun noir pur ni gris neutre pur.

### Typographie

| Rôle | Police | Détail |
|---|---|---|
| Titres et grands chiffres | Dela Gothic One | Usage parcimonieux, grandes tailles |
| Texte et interface | Figtree (variable) | Poids 400 corps, 500 étiquettes, 700 titres secondaires |
| Chiffres alignés | `font-variant-numeric: tabular-nums` | Stats, notes, rangs |

Polices servies par l'application (paquets `@fontsource`), aucun appel à un domaine tiers (NFR-15).
Échelle : 12 / 14 / 16 / 20 / 25 / 31 / 39 px, corps à 16 px, interlignage 1,5 à 1,6, lignes de texte
limitées à 65 caractères.

### Espacement, forme, mouvement

- Grille de 4 px, pas courants 4, 8, 12, 16, 24, 32, 48.
- Bordure 2 px `--ink`, rayon 10 px, ombre décalée dure `4px 4px 0` (taille réduite à 2 px à l'appui).
- Animations de 150 à 300 ms (400 ms maximum), uniquement `transform` et `opacity`, interruptibles ;
  désactivées avec `prefers-reduced-motion` (NFR-08).
- Icônes SVG uniquement, même épaisseur de trait, aucun emoji comme icône structurelle.

## 6. Composants et états

### Boutons : six états (normal, focus, survol, appui, chargement, désactivé)

| Type | Usage | Règle |
|---|---|---|
| Primaire | Une seule action principale par écran (« Ajouter », « Classer ») | Fond `--accent` |
| Secondaire | Actions d'appoint | Contour |
| Tertiaire | Actions discrètes (« annuler ») | Texte seul |
| Destructif | Retirer de la bibliothèque | `--danger` uniquement ici, séparé de l'action principale, avec confirmation |

Le bouton passe en chargement avec indicateur et est désactivé pendant toute opération asynchrone.
Cible minimale 44 × 44 px (WCAG 2.5.5). Un bouton déclenche une action, un lien navigue.

### Champs : six états (inactif, survol, actif, désactivé, validation, erreur)

Étiquette toujours visible avant et après saisie (jamais un simple *placeholder*). Validation à la
sortie du champ, pas à chaque frappe. Erreur sous le champ, avec cause et correction ; zone
`aria-live` pour l'annonce. Type de clavier adapté (nombre pour les épisodes).

### Carte d'anime (composant central)

Couverture (ratio 2:3), titre sur deux lignes maximum, progression « 5 / 12 », barre de progression,
bouton « +1 » (aucun texte seul : étiquette accessible « Marquer l'épisode suivant de [titre] »).
Badge de tier avec lettre **et** couleur. États : normal, survol (léger relèvement), focus, chargement
du +1, terminé.

### Duel (Arène)

Deux cartes côte à côte (empilées sous 600 px), choix au clic, au toucher ou aux flèches gauche/droite,
bouton « Trop dur à départager » au centre, indication de progression (« duel 2 sur 3 environ »).
Les deux cartes ont la même taille et la même mise en forme, sans biais de position.

### Carte de chaleur

Cases de 12 px avec espacement de 3 px, cinq niveaux d'intensité de `--accent`. La valeur est aussi
donnée en texte (infobulle et table masquée visuellement) : l'information ne dépend pas de la couleur.

## 6 bis. Voix et textes

Les textes suivent le guide de voix et de ton de [07-langues-et-textes.md](07-langues-et-textes.md) (calme, court,
sans justification, un verbe sur chaque bouton, erreurs sans blâme) et sont écrits dans les deux langues (FR-105 à
FR-111). Le premier fichier chargé ne contient que les textes de l'écran d'accès, en français (NFR-58).

## 7. Liste de contrôle avant livraison (UI)

**Accessibilité (WCAG)**
- [ ] Texte à 4,5:1 minimum, grands éléments et composants graphiques à 3:1
- [ ] Focus visible partout, navigation clavier complète, aucun piège de focus
- [ ] Boutons-icônes avec `aria-label`
- [ ] Aucune information portée par la couleur seule
- [ ] Texte agrandissable à 200 % sans perte

**Interactions**
- [ ] Retour visuel en moins de 100 ms
- [ ] Cibles de 44 × 44 px minimum
- [ ] Six états de bouton définis et cohérents

**Formulaires**
- [ ] Étiquettes visibles, erreurs sous le champ, validation à la sortie

**Mise en page**
- [ ] Testé à 375 px, aucun défilement horizontal
- [ ] Zones sûres respectées, éléments fixes qui ne masquent pas le contenu
- [ ] Espacement sur grille de 4 px

**Visuel**
- [ ] Icônes SVG, jetons sémantiques, modes clair et sombre testés séparément
- [ ] Chiffres tabulaires dans les statistiques

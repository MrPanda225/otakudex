# Otakudex — Conventions de code

Règles issues du guide « clean code », réduites à ce qui sert ce projet. Principe directeur : **pas
d'abstraction sans problème concret présent** (YAGNI avant SOLID).

## 1. Stack

| Couche | Choix | Pourquoi |
|---|---|---|
| Langage | TypeScript strict, sans `any` | Le typage remplace des tests entiers |
| Serveur | Node 22, Fastify, `pg`, `zod` | Paquets réputés, peu de dépendances |
| Exécution TS | Node 22 exécute le TypeScript sans compilation (retrait des types) | Pas d'étape de build côté serveur |
| Client | Preact, Vite | Léger, rapide, composants lisibles |
| Tests | Vitest ; base de test PGlite (Postgres en mémoire) | Aucun réseau, aucune base à préparer |
| Polices | Paquets `@fontsource` | Pas d'appel à un domaine tiers |
| Animations | anime.js 4, uniquement via `web/src/motion/` | Un point d'entrée : durées, `prefers-reduced-motion` et nettoyage des styles en ligne au même endroit |

## 2. Structure

```
server/
  config.ts          lecture et validation de l'environnement
  main.ts            point d'entrée : assemble et démarre
  app.ts             fabrique du serveur HTTP
  db/                interface Database, adaptateurs pg et PGlite, migrations
  kitsu/             client de l'API Kitsu et schémas de validation
  library/           bibliothèque et suivi (dépôt, service, routes)
  ranking/           logique pure du classement + service et routes
  stats/             requêtes de statistiques et routes
  picker/            tirage pondéré (logique pure)
  export/            export JSON et CSV
web/
  src/               composants Preact, pages, styles
tests/               tests par module
```

Un module = une raison de changer. Les dépendances vont dans un seul sens :
routes → services → dépôts → base. La logique de domaine (`ranking/insertion.ts`, `picker/`) ne connaît
ni HTTP ni SQL.

## 3. Nommage (court, intuitif, descriptif)

- Code, variables, fonctions et commentaires en **anglais** ; textes affichés à l'utilisateur en français.
- `camelCase` pour variables et fonctions, `PascalCase` pour types et composants, `UPPER_SNAKE_CASE`
  uniquement pour de vraies constantes de configuration.
- Pas de contraction (`usrNm`), pas de bruit (`UserData`, `UserInfo`), pas de contexte répété
  (`LibraryEntry.libraryEntryId`).
- Booléens préfixés : `is`, `has`, `should`, `can`. Jamais un nom qui force une négation.
- Fonctions : `action + contexte`. Verbes : `get` (lire), `fetch` (distant), `create`, `remove`
  (d'une collection), `delete` (définitif), `compute`, `handle` (gestionnaire d'événement), `on` (prop).
- Pas de préfixe `I` sur les interfaces.

## 4. Fonctions

- Une responsabilité par fonction ; si un commentaire sépare des « sections », on découpe.
- Trois paramètres au plus ; au-delà, un objet d'options.
- Aucun nombre magique : constantes nommées (`MAX_SEARCH_RESULTS`, `LOVED_SCORE_RANGE`).
- Séparation commande / requête : une fonction fait quelque chose **ou** renvoie quelque chose.
- Jamais de mutation des paramètres : retourner une nouvelle valeur.
- `async/await` uniquement ; appels indépendants en `Promise.all` ; aucune promesse flottante.
- Docstring : le contrat que la signature ne dit pas (valeurs nulles, effets de bord, erreurs).

## 5. Robustesse

- **Échec rapide** aux frontières : toute entrée externe (corps HTTP, réponse Kitsu, variables
  d'environnement, fichier d'import) est validée avec `zod` avant d'entrer dans le système.
- Pas de re-validation partout : on fait confiance aux types déjà validés.
- Échecs **attendus** (introuvable, entrée invalide) : valeur `Result` ou erreur typée (`NotFoundError`,
  `ValidationError`). Échecs **inattendus** (base arrêtée) : exception.
- Aucune erreur avalée en silence ; on journalise avec le contexte puis on traite ou on relance.
- Les messages d'erreur montrés à l'utilisateur disent quoi faire ; aucun détail interne (SQL, chemin).
- Commentaires : le **pourquoi**, jamais le quoi.

## 6. SOLID, au besoin seulement

- **Inversion de dépendance** : les services reçoivent `Database` et `MetadataProvider` par leur
  constructeur. Problème concret : tester sans réseau (PGlite) et remplacer Kitsu un jour (risque R1).
- **Responsabilité unique** : routes (HTTP), services (règles), dépôts (SQL), domaine (calcul pur).
- Pas de hiérarchie d'héritage ; composition par fonctions.
- Loi de Déméter : un service n'appelle pas `repo.db.pool.query(...)`.

## 7. Tests

- La logique de domaine est couverte par des tests unitaires avant les routes (NFR-20) :
  insertion dichotomique, calcul de note, tirage pondéré, série de semaines, relais d'images.
- Les dépôts et services sont testés sur PGlite avec les vraies migrations.
- Un test d'aller-retour export/restauration (FR-52).
- Un test par invariant de la section 2 de `03-donnees.md`.

## 8. Sécurité au quotidien

- Aucune concaténation de SQL, aucun `innerHTML` avec une donnée externe (Preact échappe par défaut).
- Aucun secret dans le dépôt ; `.env` ignoré, `.env.example` à jour.
- En-têtes de sécurité (CSP restrictive : `default-src 'self'`), écoute sur 127.0.0.1.
- Dépendances : `npm audit` avant chaque version, versions figées par `package-lock.json`.

## 9. Processus avant chaque fonctionnalité

1. Retrouver l'exigence dans `01-exigences.md` (identifiant FR/NFR).
2. Vérifier le parcours et les états dans `02-ux-ui.md`.
3. Vérifier le schéma et les invariants dans `03-donnees.md`.
4. Écrire le test du domaine, puis le code, puis relire avec les règles ci-dessus.
5. Lancer `npm run check` (types, tests, audit) avant de déclarer terminé.

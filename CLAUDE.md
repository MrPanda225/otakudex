# Otakudex

Application web pour classer et suivre les anime regardés, entre amis : un compte et un Dex par personne,
créés sur invitation de l'administrateur (premier compte). Voir `docs/06-comptes-et-connexion.md`.
Stack : TypeScript strict, Node 22, Fastify, Postgres (Neon en production, homelab en local), Preact + Vite.

## Règle d'or : réfléchir avant de coder

Avant d'écrire la moindre ligne d'une fonctionnalité, suivre ces cinq guides dans cet ordre.
Les documents du dossier `docs/` en sont la trace ; les lire avant de toucher au code.

1. **Exigences** (`/anthropic-skills:requirements-engineering`) : `docs/01-exigences.md`. Chaque
   fonctionnalité renvoie à un identifiant FR/NFR. Un besoin n'est pas une exigence. Exigences
   atomiques, vérifiables, avec « doit » ou « peut », sans mot vague.
2. **UX** (`/anthropic-skills:ux-design`) : `docs/02-ux-ui.md`, section UX. Nommer le modèle qui
   justifie chaque choix (Fogg, Hook, Kano, Pareto, Peak-End, Karaponos, Wurman). Aucun dark pattern.
3. **UI** (`/anthropic-skills:ui-design`) : `docs/02-ux-ui.md`, section UI. WCAG 2.2 AA d'abord,
   jetons sémantiques, six états de bouton, grille de 4 px, `prefers-reduced-motion`, icônes SVG.
4. **Données** (`/anthropic-skills:dba-mysql`, principes transposés) : `docs/03-donnees.md`. Le guide
   cible MySQL, la base est **PostgreSQL** : on garde les principes (colonnes explicites, EXPLAIN,
   moindre privilège, sauvegarde vérifiée), pas les commandes MySQL.
5. **Code propre** (`/anthropic-skills:clean-code`) : `docs/04-conventions-code.md`. Pas d'abstraction
   sans problème concret, trois paramètres au plus, validation `zod` aux frontières, jamais de `any`.

## Contraintes du propriétaire

- Éviter les sites douteux : métadonnées uniquement via l'API **Kitsu**. Aucun scraping, relais non
  officiel, streaming ou téléchargement illégal (voir `docs/etude-concurrents.md`).
- Le navigateur ne contacte aucun domaine tiers (polices et couvertures servies par l'app).
- L'interface existe en français et en anglais ; le code et les commentaires sont en anglais. Aucun texte visible dans un composant : tout passe par les catalogues `web/src/i18n/messages/` (et `shared/i18n/server-messages.ts` pour le serveur), dans les deux langues, au ton du guide `docs/07-langues-et-textes.md` (`tests/i18n.test.ts` le vérifie). Les genres de Kitsu passent par `web/src/i18n/genres.ts`, les synopsis par `server/translate/`. Les titres d'anime ne sont jamais traduits.
- Comptes : tout `/api/*` exige une session sauf la liste fermée de `server/http/auth-guard.ts` ; chaque
  requête de données porte le propriétaire (`userId` en premier paramètre, tiré de la session, jamais de
  l'URL ni du corps) ; l'administrateur ne lit jamais la bibliothèque d'un autre.
- Les identifiants de base de données viennent de `DATABASE_URL` (fichier `.env`, jamais versionné).
  Ne jamais demander ni écrire un mot de passe dans le chat ou dans un fichier versionné.

## Interface

- Animations : anime.js, uniquement via `web/src/motion/` (durées, `prefers-reduced-motion`, voir `docs/05-refonte-ux-animations.md`). Seules exceptions, volontaires : l'arrivée de la carte de connexion, les notifications et le fond des écrans d'accès sont en `@keyframes` CSS, pour que le premier fichier chargé n'embarque pas anime.js (mêmes durées, mêmes règles de mouvement réduit).
- Graphiques : suivre le guide `/anthropic-skills:bi-dashboard-design` (un accent, barres à zéro, contexte pour chaque chiffre).

## Commandes

- `npm run dev` : serveur et client en développement
- `npm test` : tests (Vitest, base PGlite en mémoire)
- `npm run check` : types, tests et audit des dépendances
- `npm run migrate` : applique les migrations sur `DATABASE_URL`
- `npm run admin:reset-link -- <e-mail>` : lien de réinitialisation de mot de passe (sur la machine du serveur)

## Avant de déclarer terminé

`npm run check` vert, exigences touchées cochées, et `/security-review` lancé sur les changements en cours.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

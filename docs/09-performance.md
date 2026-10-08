# Otakudex — Performance : constats, budgets, mesure

Demande du propriétaire (2026-10-08) : « optimise les perf et tout », avec un rapport Lighthouse 13.4.1
(`http://127.0.0.1:5173/#/dex`, performance 78, accessibilité 100, bonnes pratiques 96, SEO 83).
Exigences : NFR-55, NFR-57, NFR-58 (déjà en place), NFR-61 à NFR-66 (ce document).

## 1. Ce que le rapport mesure vraiment

Le rapport vient du **serveur de développement Vite** (port 5173), pas de la version construite. Il y manque
tout ce qui fait la production, et il y ajoute ce qui n'y sera jamais :

| Ligne du rapport | Cause | Verdict |
|---|---|---|
| Minifier le JavaScript, JavaScript inutilisé, poids total, modules dupliqués, longue chaîne de dépendances | 112 modules non regroupés, `@vite/client` (221 Ko), `preact/debug`, `prefresh`, anime.js non minifié (1,1 Mo) | Bruit de développement. À ne pas « corriger » |
| Erreurs de console, une part du JavaScript inutilisé | Extensions du navigateur de la personne qui mesure (gestionnaire de cookies, outils Preact) | Hors application |
| En-têtes de sécurité absents | Vite ne les envoie pas ; Fastify les envoie en production | Bruit, sauf COOP (voir 3.5) |
| Cascade de chargement, LCP simulé de 3,4 s | Réel : l'ordre des requêtes d'une personne connectée (3.1) | **À corriger** |
| `label-content-name-mismatch` (lien de marque, couvertures) | Réel : le nom accessible ne contient pas le texte visible (WCAG 2.5.3) | **À corriger** |
| Pas de `meta description`, `/robots.txt` renvoie la page | Réel | **À corriger** |
| Polices découvertes tard | Réel mais petit (CLS 0,0057) | **À corriger**, peu cher |
| Animation non composée sur `li.card.card--done` (`background-position`) | Introuvable dans le code : aucune règle `background-position` sur les cartes (seule l'animation `shimmer` du squelette en utilise une). Probablement une extension | **Non reproduit**, rien à changer |

## 2. Ce que la version construite pèse (mesuré par `npm run build`, 2026-10-08)

| Fichier | Brut | Compressé (gzip) | Chargé |
|---|---|---|---|
| Entrée `index-*.js` (écran de connexion, catalogue `access` français) | 49,2 Ko | 18,6 Ko (budget 20 Ko, NFR-55) | tout de suite |
| `index-*.css` | 43,0 Ko | 8,5 Ko | tout de suite |
| `SignedInApp-*.js` (pages, graphiques, fiche, administration) | 122,5 Ko | 40,1 Ko | après la connexion |
| `app-*.js` (textes de l'application), un par langue | 13,6 et 14,8 Ko | 4,7 et 5,2 Ko | avec l'application |
| `access-*.js` (textes de connexion en anglais) | 2,6 Ko | 1,1 Ko | à la demande |
| Polices utilisées (woff2) : Figtree latin, Dela Gothic latin | 20,2 et 13,8 Ko | – | avec le CSS |

Le total de JavaScript d'une personne connectée est d'environ 64 Ko compressés. **Ce n'est pas le poids qui
ralentit le démarrage, c'est l'enchaînement.** Découper chaque page en fichier séparé gagnerait au mieux
quelques Ko compressés (les graphiques) pour une requête de plus par page : écarté tant qu'une mesure ne
montre pas le contraire (voir 5).

## 3. Les corrections

### 3.1 Cascade du démarrage (NFR-61)

Avant : page → entrée → (pour un navigateur en anglais) petit fichier de textes `access` → `/api/auth/state` →
fichier de l'application (122 Ko) → fichier des textes de l'application (`useEffect` de `SignedInApp`) →
`/api/library` → affichage. Six allers-retours à la suite pour une personne connectée en anglais, cinq en
français, chacun attendant la fin du précédent.

Deux corrections, qui se cumulent :

1. **La question « qui est connecté ? » part dès le démarrage** (`auth/early-state.ts`, appelée par
   `main.tsx` avant le premier rendu) avec la langue déjà choisie. Avant, rien en dessous du fournisseur de
   langue n'existait tant que le fichier `access` anglais n'était pas arrivé, et la question attendait.
   `AuthProvider` reprend cette réponse au premier essai ; si elle a échoué, une requête ordinaire la
   remplace (son texte d'erreur est écrit dans la langue de la page, ce que la première ne pouvait pas).
2. **Pour un navigateur qui se souvient qu'une session était ouverte**, le fichier de l'application et celui
   des textes de la langue sont aussi demandés dès le démarrage (`warmUpForReturningPerson`). Les imports
   dynamiques sont mis en cache : l'import de `SignedInApp` fait plus tard par `lazy()` reprend la même
   promesse, rien n'est téléchargé deux fois.

Le souvenir est un drapeau `otakudex.returning` dans `localStorage`. Il ne contient aucune donnée
personnelle (la valeur est toujours `1` ; pas d'identité, pas de jeton ; la session reste dans son cookie
`HttpOnly`). Il est posé quand l'application répond « connecté » ou accepte une connexion, et effacé dès que
la phase devient « déconnecté » ou « première installation » : déconnexion volontaire, session expirée, ou
drapeau périmé (cookie parti). Un drapeau périmé ne coûte qu'un téléchargement anticipé, que l'écran de
connexion fait de toute façon en temps d'inactivité (`prefetchSignedInApp`).

Mesure (Chrome sans cache, navigateur en anglais, liaison émulée à 1,6 Mb/s et 150 ms, serveur de production
sur un dossier de données à part, médiane de trois passages, temps jusqu'à la première couverture affichée) :

| Cas | Première couverture | Cascade |
|---|---|---|
| Avant | 1 686 ms | `index` → `access` → `auth/state` → `SignedInApp` → `app` → `library` |
| Après, sans souvenir (premier passage, ou drapeau absent) | 1 603 ms (−5 %) | `auth/state` part avec `access` ; le reste suit comme avant |
| Après, avec souvenir | **1 294 ms (−23 %)** | `auth/state`, `access`, `app` et `SignedInApp` en parallèle, puis `library` |

Sur cette liaison lente, ce qui limite ensuite est le téléchargement du fichier de l'application (40 Ko
compressés), parti en même temps que les autres. Pour un navigateur en français le gain sans souvenir est
plus petit encore : il n'y a pas de fichier `access` à attendre, la question partait déjà au premier rendu.

**Non retenu : lancer aussi `/api/library` en avance.** Gain probable d'un aller-retour (environ 150 ms ici),
mais la réponse serait gardée en mémoire avant que l'on sache qui est connecté : si la session s'arrête
entre-temps et qu'une autre personne se connecte dans le même onglet, elle pourrait recevoir la
bibliothèque de la première. Les comptes sont étanches par construction (`docs/06`) ; ce gain ne vaut pas
d'ouvrir cette porte. À reprendre seulement avec une réponse liée à l'identité de la personne.

### 3.2 Nom accessible (NFR-62)

WCAG 2.5.3 (*Label in Name*) : le nom d'un contrôle doit contenir son texte visible, pour que la commande
vocale « cliquer Terminé » fonctionne. L'outil d'audit lit aussi les lettres décoratives.

- Couverture : `Ouvrir {titre}, {pastilles}` quand une pastille est visible (tier, statut), `Ouvrir {titre}`
  sinon.
- Lien de marque : la lettre « O » du logo est dessinée par le CSS (`::before`), donc absente du texte du
  lien, dont le nom reste « Otakudex, accueil ».
- Couverture manquante : la lettre de remplacement est elle aussi dessinée par le CSS.

### 3.3 Polices (NFR-63)

Le CSS déclare les polices ; le navigateur ne les demande qu'après avoir lu le CSS. Deux `preload` (Figtree
latin, Dela Gothic latin) les font demander en même temps que le script. Ajouté à la page au moment du
build par un petit plugin Vite, parce que les noms de fichiers portent une empreinte. Même origine, aucun
domaine tiers. Les variantes `latin-ext` restent chargées à la demande par le CSS (`unicode-range`).

### 3.4 Description et `robots.txt` (NFR-64)

`<meta name="description">` dans `index.html`. `web/public/robots.txt` interdit `/api/` et laisse la page
d'entrée explorable. **Choix à connaître** : `Disallow: /` ou `noindex` garderait l'application hors des
moteurs de recherche, mais le contrôle « explorable » de Lighthouse échouerait. Rien de
personnel n'est servi sans connexion, donc la page de connexion indexée ne révèle que l'existence du site.

### 3.5 En-têtes (NFR-65)

`Cross-Origin-Opener-Policy: same-origin` : l'application n'ouvre aucune fenêtre tierce, donc rien ne casse.
`Strict-Transport-Security` n'est pas ajouté : il n'a de sens que derrière HTTPS (NFR-39) et mesuré en
`http://127.0.0.1` il ne s'appliquerait pas.

## 4. Budgets (NFR-66)

| Mesure | Budget | Mesuré |
|---|---|---|
| Premier JavaScript, gzip | 20 Ko (NFR-55) | 18,6 Ko |
| Fichier de l'application, gzip | 48 Ko | 40,1 Ko |
| CSS, gzip | 10 Ko | 8,5 Ko |

Marge d'environ 20 % : assez pour ajouter une page, pas assez pour laisser entrer une bibliothèque sans le
voir. Vérifiés par `tests/bundle.test.ts` après `npm run build`.

## 5. Protocole de mesure

1. `npm run build`, puis `npm start` sur un dossier de données **à part** (pas `.data/dev`) et un autre port.
2. Lighthouse en mode navigation sur cette adresse, **profil mobile par défaut**, fenêtre sans extension.
   Mesurer deux parcours : écran de connexion, puis Dex d'une personne connectée (bibliothèque garnie).
3. Noter performance, LCP, TBT, CLS, et la cascade des requêtes du second parcours.
4. Ne jamais mesurer `npm run dev` : les chiffres ne disent rien de la production.

À mesurer pour décider la suite (rien n'est fait tant que le chiffre ne le demande pas) :
- découpage des pages et des fenêtres en fichiers séparés (graphiques, arène, administration) : seulement si
  le fichier de l'application dépasse 48 Ko ou si le temps de blocage total le demande ;
- `/api/library` lancée en avance : écartée pour l'instant, voir 3.1 (étanchéité entre comptes) ;
- retrait des polices `.woff` (le navigateur n'utilise que le woff2) : sans effet sur le chargement.

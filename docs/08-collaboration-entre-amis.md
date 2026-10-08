# Otakudex — Collaborer entre amis : propositions

Demande du propriétaire (2026-10-08) : « fais une recherche pour comment ce serait fun entre plusieurs
utilisateurs de collaborer sur l'application et fais-moi des propositions ». Ce document rassemble ce que font
des produits connus, ce que disent les études, et ce qui irait bien à Otakudex (petit cercle d'amis de confiance,
un Dex par personne, classement par duels). **Rien n'est construit** : ce sont des propositions à choisir.
Besoin B10 (comparer entre amis, « pour la suite »), exigences FR-95 à FR-100, `docs/06` (l'administrateur ne lit
jamais les bibliothèques).

Règle de lecture : les faits viennent de sources officielles (aide, blogs d'ingénierie, documentation, articles
scientifiques) ; ce qui est une **idée de conception** (déduite, pas observée chez un produit) est marqué ainsi.

## 1. Ce que font les autres

| Produit | Mécanique utile | Source |
|---|---|---|
| Letterboxd | Suivre des membres : leurs ajouts, avis et mentions J'aime remplissent un fil d'activité. Niveaux de confidentialité « tout le monde / amis proches / moi » par défaut et par entrée. Les listes privées se partagent par lien secret ; la collaboration à plusieurs y est annoncée, pas livrée. Le bilan annuel exclut les entrées privées. | [FAQ](https://letterboxd.com/about/faq/), [listes privées](https://letterboxd.com/journal/between-us-private-lists-sharing/), [confidentialité](https://letterboxd.com/journal/public/) |
| Trakt | Suivi à sens unique, amis = suivi mutuel. Réactions par émoji (février 2026), comparaison du temps regardé en préparation. Un réglage « sans spoilers » floute titres, images et résumés de ce qu'on n'a pas vu. | [journal des changements](https://roadmap.trakt.tv/changelog), [spoilers](https://forums.trakt.tv/t/no-spoilers-how-do-i-hide-spoilers/22156) |
| Simkl | Comparer ses listes « à voir » et « vu » avec des amis, et choisir « avec qui on regarde ». Le précédent le plus proche d'un choix de groupe. | Texte du site vu dans un extrait de recherche (la page a refusé l'accès) |
| MyAnimeList | Clubs (communautés par centre d'intérêt, dont des clubs saisonniers). Le score d'affinité est une corrélation de Pearson sur les notes communes : d'après des utilisateurs du forum et une bibliothèque tierce, pas d'après MAL. | [clubs](https://myanimelist.net/clubs.php), [bibliothèque](https://malaffinity.readthedocs.io/en/stable/getting_started/introduction.html) |
| Goodreads | « Comparer les livres » : ce qu'on a en commun avec un ami. | [blog](https://www.goodreads.com/blog/show/856-goodreads-hack-are-you-reading-compatible-with-your-friends) |
| Beli (classement de restaurants) | Classer en comparant un nouveau lieu à ceux déjà classés, donc très proche des duels d'Otakudex ; fil des amis, « Match Score » avec chaque ami. Classement mondial par nombre de lieux consignés (la presse le décrit comme un sport de compétition). | [fiche App Store](https://apps.apple.com/us/app/beli-food-reviews-lists/id1478375386), [presse](https://www.today.com/today/amp/rcna217748) |
| Spotify Blend | Jusqu'à 10 personnes, une liste commune mise à jour chaque jour, un score d'accord et des « histoires de données » (artistes ou genres en commun). Buts écrits : pertinence, cohérence, égalité, choix démocratique ; « maximiser la joie » plutôt que « minimiser la peine ». | [aide](https://support.spotify.com/us/article/blend/), [ingénierie](https://engineering.atspotify.com/2021/12/a-look-behind-blend-the-personalized-playlist-for-youand-you) |
| Duolingo | Quêtes entre amis : 5 jours, un partenaire, un but commun, encouragements préécrits. Série à deux : chacun fait une leçon par jour. Pour limiter la pression : gel de série, et une série ne demande qu'une leçon, pas tout l'objectif. Les chiffres (« 22 % de chances en plus ») sont ceux de l'éditeur et corrélatifs. | [quêtes](https://blog.duolingo.com/friends-quests/), [série à deux](https://blog.duolingo.com/friend-streak/), [série](https://blog.duolingo.com/how-duolingo-streak-builds-habit/) |
| Strava | Félicitations en un geste, sans annulation, notifications réglables. Défis de groupe visibles des seuls participants ; le but « de groupe » additionne tout le monde, sans classement. La confidentialité de chaque activité décide si elle compte. | [kudos](https://support.strava.com/en-us/articles/15402054-what-is-kudos), [défis](https://support.strava.com/en-us/articles/15401736-group-challenges), [confidentialité](https://support.strava.com/en-us/articles/15401987-activity-privacy-controls) |
| Visionnage synchrone (Plex, Discord) | Peu pertinent : Otakudex ne diffuse rien. | – |

Recherche sur le choix de groupe : Masthoff (2004) compare des stratégies pour combiner les goûts d'un groupe devant
la télévision (moyenne, moindre misère, Borda…) ; les gens tiennent à l'équité et à ce que personne ne
déteste le choix ([résumé](https://abdn.elsevierpure.com/en/publications/group-modeling-selecting-a-sequence-of-television-items-to-suit-a/)).
Le coefficient tau de Kendall mesure l'accord entre deux classements (paires concordantes moins discordantes,
divisées par le total, [NIST](https://www.itl.nist.gov/div898/software/dataplot/refman1/auxillar/kend_tau.htm)) ;
il va naturellement avec des classements construits par comparaisons de paires.

Ce que disent les études sur le fun et la pression (petits échantillons, domaine de la forme physique, résultats
mêlés — à prendre comme des indices) : en coopération, les gains sont réels mais s'estompent après environ trois
semaines, la compétition tient plus longtemps mais met plus de pression ([STEP UP, n = 602](https://pmc.ncbi.nlm.nih.gov/articles/PMC6735420),
[Ma et al. 2024](https://ideas.repec.org/a/taf/tbitxx/v43y2024i11p2401-2423.html)). Les notifications nombreuses
sont liées à des émotions négatives et à un sentiment de lien à la fois ; Apple conseille d'en envoyer peu et de
donner un réglage fin ([HIG](https://developer.apple.com/design/human-interface-guidelines/notifications)).

## 2. Les propositions, de la plus sûre à la plus ambitieuse

Classement : plaisir attendu, effort, risque (spoilers, pression sociale, vie privée). Les idées marquées
**(idée)** sont de moi, pas observées dans un produit.

| # | Proposition | Comment ça marche dans Otakudex | Plaisir | Effort | Risque |
|---|---|---|---|---|---|
| 1 | **Partage au choix** (préalable à tout le reste) | Trois niveaux : privé (par défaut), amis, un ami nommé ; dérogation par anime. Rien n'est vu sans action de la personne (vie privée par défaut). Précédents : Letterboxd, Strava. | – (condition) | Moyen | Faible |
| 2 | **Accord de goûts avec un ami** | Pour deux amis, un score d'accord (style Kendall) sur les anime classés par les deux, toujours affiché avec le nombre d'anime en commun et un minimum (« pas encore assez en commun »). On commence par ce qui rapproche, pour qu'un chiffre bas ne vexe pas (comme les « histoires » de Spotify). | Élevé | Faible à moyen | Faible |
| 3 | **Désaccords et coups de cœur communs** **(idée)** | « Toi : S, lui : D » pour les plus gros écarts ; liste des anime que vous placez tous les deux en haut. Prête à lancer une discussion. | Élevé | Faible | Faible |
| 4 | **Ce soir, à plusieurs** | L'intersection des listes « À voir » des présents, classée par Borda ou « moindre misère » (personne ne déteste), un veto par personne et par séance. Deux modes : « choix sûr » et « choix osé » (Blend a choisi l'inverse, maximiser la joie). Précédent : Simkl. | Élevé | Moyen | Faible |
| 5 | **But commun de saison, sans classement** | « À nous tous, N épisodes cette saison », une jauge partagée, sans pénalité d'équipe ni tableau des scores. Court et saisonnier, car l'effet coopératif s'use (Strava, objectif de groupe). | Moyen | Moyen | Faible |
| 6 | **Visionnage en parallèle d'un anime en cours de diffusion** | Même épisode pour plusieurs amis, avancement affiché en « en avance / en retard » sans révéler l'intrigue ; un mot sur l'épisode n'apparaît qu'à ceux qui l'ont vu (flou comme Trakt). Précédent : clubs saisonniers de MAL. | Élevé | Élevé | **Spoilers** |
| 7 | **Félicitations sans commentaire** | Un geste « bravo » sur un anime terminé ou un nouveau tier S, sans annulation, sans texte (Strava, réactions Trakt). | Moyen | Faible | Très faible |
| 8 | **Duel à l'aveugle** **(idée)** | Deux amis répondent aux mêmes duels sans voir la réponse de l'autre, puis on révèle les accords (cadre : « sur combien êtes-vous d'accord », pas « qui gagne »). Proche de la logique de Beli. | Élevé | Moyen | Faible |
| 9 | **Bilan de saison entre amis** | Anime préférés en commun, qui a mis le plus haut, temps regardé ; en excluant les entrées privées (comme Letterboxd). Ponctuel. | Moyen | Moyen | Faible |
| 10 | **Résumé plutôt que notifications** | Un résumé hebdomadaire à consulter dans l'application, avec silence par ami (HIG). | – (confort) | Moyen | Faible |

À reporter : les séries à deux où les deux doivent agir chaque jour (Duolingo montre un gain mais exige des gels ;
on ne regarde pas d'anime tous les jours) et les classements publics au nombre d'anime consignés (Beli récompense
la quantité).

### Ma recommandation

Commencer par **1 + 2 + 3** : un seul chantier de confidentialité, puis deux écrans simples qui donnent déjà de
quoi parler entre amis. Ensuite **4** (le plus utile au quotidien : « on regarde quoi ce soir ? »), puis **7**
(presque gratuit). **6** est le plus fun et le plus risqué (spoilers) : à garder pour quand le reste vit.

Contrainte de conception à graver avant de construire : le partage est une **action explicite de la
personne** (pas de comparaison tant que les deux n'ont pas dit oui), l'administrateur n'a aucun droit de plus,
et un score ne s'affiche jamais sans le nombre d'anime sur lequel il repose.

## 3. Ce qui n'a pas pu être vérifié

- Fonctions officielles d'AniList (accès refusé), formule officielle d'affinité de MAL, seuil « 10 anime en
  commun » (source tierce seulement).
- Comparaison d'amis de Simkl, Serializd, défis d'amis de Goodreads (pages non rendues).
- Beli : aucune page d'aide ni billet d'ingénierie trouvé ; formule du « Match Score » inconnue, méthode de
  classement connue par la presse.
- Plex et Discord (extraits de recherche), Steam (forums seulement), partage sans spoiler de Wordle (presse),
  Flickchart (presse).
- Aucune étude indépendante sur les séries qui pèsent, ni sur le social appliqué aux anime : les indices
  ci-dessus viennent du sport et de petits échantillons.

## 4. Décisions pour le propriétaire

1. Quelles propositions te donnent envie ? (un choix de 2 ou 3 suffit pour la suite)
2. Le partage par défaut doit-il rester **privé** (recommandé) ?
3. Veux-tu des notifications, ou seulement un résumé dans l'application ?

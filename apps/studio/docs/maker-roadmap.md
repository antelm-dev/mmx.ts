# Feuille de route Mega Man Maker

Ce document décrit où va Studio : un Mega Man Maker fait par des fans, gratuit,
pour toutes les sagas 2D. Il fixe les trois chemins par lesquels le contenu entre
dans un projet, le modèle de données qui le reçoit, l'état de chaque saga et les
décisions qui encadrent le tout. Il ne promet aucune date : l'ordre suit les
plans du Project 8 (P7, P8, P9) et les issues citées.

Le détail de l'import Steam (formats, oracles, questions ouvertes) reste dans
[zero-import.md](zero-import.md).

## Vision

**Ce que « Maker » veut dire ici.** Studio permet de construire et de jouer :

- des **niveaux** : tuiles, collision, couches d'image, objets, zones caméra,
  checkpoints ;
- des **personnages** : un loadout (abilities, armes, physique) et ses
  animations ;
- des **ennemis** : une définition moteur (acteur, abilities) et leur planche ;
- des **packs** : un lot d'assets avec ses crédits, échangé entre utilisateurs.

Le moteur est mmx-engine (simulation déterministe, replays, build navigateur,
Play de Studio). Toutes les sagas 2D y passent : Classic, X, Zero, ZX.

**Ce que « Maker » ne veut pas dire.** Studio ne distribue aucun asset. Il ne
télécharge rien, n'héberge rien et ne contient aucun lien vers un site tiers. Le
contenu vient de l'utilisateur : ses jeux achetés, ses fichiers, les packs qu'il
reçoit d'autres utilisateurs.

## Trois chemins de contenu

| Chemin                                                                                   | Ce qu'il fournit                                                                                                                                                                           | Ce qu'il ne fournit pas                                                                                                                | Où il écrit                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Import Steam** (référence)                                                             | Les données exactes des jeux possédés : planches et clips d'origine, sons, musique, art et collision de niveau, limites caméra. Aujourd'hui : Zero (MMZ1), Pantheon, Intro Highway (MMX1). | Tout jeu que l'utilisateur ne possède pas ; la logique de stage (scripts, boss) ; un projet partageable (il reste dérivé de Capcom).   | Un nouveau projet, dans un dossier vide choisi par l'utilisateur, avec son `.gitignore` `*` (voir [zero-import.md](zero-import.md#the-generated-project)). |
| **Planches apportées** (P7, [#77](https://github.com/antelm-dev/mmx-studio/issues/77))   | N'importe quelle planche PNG (dessin perso ou rip communautaire), découpée en régions puis assemblée en clips ancrés jouables.                                                             | Les données de jeu (durées, ancres, hitboxes d'origine) : l'utilisateur les pose à la main ; aucune garantie sur la provenance du PNG. | Le projet ouvert : un asset `sprite` (avec `regions`) et un asset `animation`, fichiers sous `assets/`.                                                    |
| **Packs communautaires** (P9, [#79](https://github.com/antelm-dev/mmx-studio/issues/79)) | Un zip `pack.json` + fichiers : des assets (et éventuellement des niveaux) avec des crédits obligatoires.                                                                                  | Un annuaire, un hébergement ou un téléchargement dans l'application ; une signature ; des dépendances entre packs.                     | Le projet ouvert : les assets du pack, ids renommés en cas de collision ; retirer le pack retire ses assets.                                               |

L'import Steam est la source de référence quand le jeu est possédé. Les deux
autres chemins servent ce qu'il ne couvre pas : sagas non importées, contenu
original, contenu partagé.

## Modèle de données

### Projet

Un projet Studio est un dossier :

- `project.json` : le manifeste (assets déclarés, `player.loadout`) ;
- `game/data.json` : les bindings (animation du joueur, sons, tirs, HUD, police,
  musique, animations d'ennemis) ;
- `levels/*.json` : les documents de niveau (`LevelDocument`, schéma v2) ;
- `assets/` : les fichiers référencés par le manifeste ;
- `ATTRIBUTION.md` : les crédits.

### Assets

| Kind        | Rôle                                                                                                                                      | Contrat        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `image`     | art de niveau, fond                                                                                                                       | existant       |
| `sprite`    | une planche PNG ; `regions?: { id, region: [x, y, w, h] }[]` issues du découpage, ignorées par le moteur                                  | C-REGIONS (P7) |
| `animation` | `animations[name] = { frames: [{ region, duration, anchor? }], loop, loopStart? }` sur `sheetAssetId` ; `duration` en 1/60 s, `speed: 60` | C-CLIP (P7)    |
| `sound`     | effet ou musique                                                                                                                          | existant       |
| `font`      | police du HUD et des menus                                                                                                                | existant       |
| `tileset`   | `{ id, kind: "tileset", path, tileSize, columns?, collision: Record<index, TerrainTile>, slopes? }`                                       | C-TILESET (P8) |

**Ancre par frame (C-ANCHOR, P7).** `FrameData.anchor?: [x, y]`, en pixels depuis
le coin haut-gauche de `region`, est le point posé sur les pieds du corps et
centré sur lui. Sans ancre, le moteur garde le rendu par cellule fixe. C'est ce
qui rend utilisables les planches de n'importe quelle saga sans réempaquetage.

### Niveau

Un `LevelDocument` porte :

- **collision** : `tiles`, la seule vérité de collision (Empty, Solid, pentes ;
  `OneWay` ajouté par C-ONEWAY, P8 : solide par le dessus, « bas + saut » passe
  à travers) ;
- **couches de tuiles** : `tileLayers?: { id, tilesetId, layer, parallax, cells }[]`,
  `cells.length = cols × rows`, `-1` = vide ; présentation seule, jamais compilée
  dans `LevelData` (C-TILELAYER, P8). Peindre une tuile écrit l'art et la
  collision ensemble ;
- **couches d'image** : `imageLayers` et `backdrop` (existants) ;
- **objets** : spawn (exactement un), ennemis, pickups ;
- **zones caméra** : objets `camera-zone` (existants) ;
- **checkpoints** : pas encore d'objet ; une mort renvoie au spawn
  ([mmx.ts#44](https://github.com/antelm-dev/mmx.ts/issues/44)).

### Loadouts par saga

Un loadout (`packages/engine/src/data/loadouts.ts` dans mmx-core-ts) choisit
l'acteur, la liste ordonnée d'abilities et les armes ; le projet le sélectionne
par `player.loadout`.

- `player.x` : idle, walk, fall, wall-slide, dash, air-dash, jump, dash-jump,
  wall-jump, dash-wall-jump, intro, damage, death, shot, charge ; armes `buster`
  et `dark_arrow`.
- `player.zero` : les mêmes mouvements sans air-dash, intro, shot ni charge, plus
  `zero.slash` (combo 3 coups, dash/jump/wall slash) ; aucune arme.

Un loadout Classic (sans dash, avec échelles) et un loadout ZX restent à écrire.

### Données d'ennemis

Une définition d'ennemi (pack MMX Starter, `packages/pack-mmx-starter/data/game.json`,
copié dans le `data/game.json` du projet) relie un acteur à
une liste d'abilities : `metool` (Patrol, Hide, Stun, Death), `bat` (Hover,
Pursuit, Recoil, Death), `pantheon` (Patrol, Shoot, Stun, Death). Le projet lie
la planche par `enemyAnimations.<id>`. Un nouvel ennemi demande encore du code
moteur ; Studio ne place que les ennemis connus.

### Format de pack (C-PACK, P9)

Archive zip : `pack.json` { `schemaVersion: 1`, `id`, `name`, `version`,
`saga?`, `author`, `credits: { sources: [{ asset | glob, origin, author?, licence? }] }`
(non vide), `assets: ProjectAsset[]`, `levels?` } plus les fichiers aux chemins
déclarés. Le module `packSchema` de `src/project-io` le valide ; un pack sans
crédits est refusé ([#74](https://github.com/antelm-dev/mmx-studio/issues/74)).

## État par saga

| Saga    | Machine d'origine | Écran                                                     |
| ------- | ----------------- | --------------------------------------------------------- |
| Classic | NES               | 256×240, scrolling écran par écran, échelles, pas de dash |
| X       | SNES, puis PSX    | 256×224                                                   |
| Zero    | GBA               | 240×160                                                   |
| ZX      | DS                | 256×192                                                   |

Le moteur a aujourd'hui une seule vue, 398×224 (`VIEW_WIDTH` × `VIEW_HEIGHT`).

### X

Existant : c'est la saga d'origine du moteur. Loadout `player.x`, physique SNES,
ennemis `metool` et `bat`, template `mmx-demo`. L'import Steam lit l'Intro
Highway de MMX1 : art, collision, pentes, limites caméra en zones
([#36](https://github.com/antelm-dev/mmx-studio/pull/36)) ; la mort sous la
section caméra suit la règle de MMX
([mmx.ts#28](https://github.com/antelm-dev/mmx.ts/pull/28)).

Manques : les scripts de stage (route qui s'effondre, Bee Blader, Vile), la
musique MMX1 (piste brouillée), les plateformes traversables (les dessus
`0x34`/`0x35` restent solides jusqu'à C-ONEWAY,
[mmx.ts#43](https://github.com/antelm-dev/mmx.ts/issues/43)).

### Zero

Existant : acteur, loadout et abilities `zero.*` à physique GBA
([mmx.ts#13](https://github.com/antelm-dev/mmx.ts/pull/13)), sabre
([mmx.ts#24](https://github.com/antelm-dev/mmx.ts/pull/24)), Pantheon Hunter
([mmx.ts#31](https://github.com/antelm-dev/mmx.ts/pull/31),
[#37](https://github.com/antelm-dev/mmx-studio/pull/37)), musique de stage
([mmx.ts#39](https://github.com/antelm-dev/mmx.ts/pull/39)), choix du loadout
par projet ([#24](https://github.com/antelm-dev/mmx-studio/pull/24)), import
Steam de Zero et de ses sons depuis MMZ1
([#36](https://github.com/antelm-dev/mmx-studio/pull/36)).

Manques : HUD, effets et tirs propres (empruntés à X), rôles sonores vérifiés,
frames d'origine avec leur ancre au lieu de `packFrames`
([#71](https://github.com/antelm-dev/mmx-studio/issues/71)), écran 240×160
([mmx.ts#45](https://github.com/antelm-dev/mmx.ts/issues/45)).

### Classic

Rien n'existe encore. Manques :

- la physique NES (sans dash ni wall-jump) et un loadout Classic ;
- les échelles (terrain et ability) ;
- le scrolling écran par écran (le moteur suit le joueur en continu) ;
- l'écran 256×240 ([mmx.ts#45](https://github.com/antelm-dev/mmx.ts/issues/45)) ;
- un éventuel chargeur Steam ; d'ici là, les planches apportées (P7) et les
  packs (P9) sont les seules sources.

### ZX

Rien n'existe encore. Les données sont dans la même collection Steam que Zero
(banques `*_z{1..4}.bin` voisines, voir [zero-import.md](zero-import.md)), mais
aucun lecteur ne les lit. Manques : un loadout ZX, l'écran 256×192
([mmx.ts#45](https://github.com/antelm-dev/mmx.ts/issues/45)), un éventuel
chargeur.

### Commun à toutes les sagas

Ancre par frame ([mmx.ts#41](https://github.com/antelm-dev/mmx.ts/issues/41)),
découpeur de planche ([#67](https://github.com/antelm-dev/mmx-studio/issues/67)),
éditeur de clips ([#68](https://github.com/antelm-dev/mmx-studio/issues/68)),
palettes ([#69](https://github.com/antelm-dev/mmx-studio/issues/69)),
remplacement de planche ([#70](https://github.com/antelm-dev/mmx-studio/issues/70)),
couches de tuiles ([mmx.ts#42](https://github.com/antelm-dev/mmx.ts/issues/42)),
tuile traversable ([mmx.ts#43](https://github.com/antelm-dev/mmx.ts/issues/43)),
tileset et peinture ([#72](https://github.com/antelm-dev/mmx-studio/issues/72)),
checkpoints ([mmx.ts#44](https://github.com/antelm-dev/mmx.ts/issues/44)),
rôles sonores ([#73](https://github.com/antelm-dev/mmx-studio/issues/73)),
packs ([#74](https://github.com/antelm-dev/mmx-studio/issues/74)), mention fan
content ([#75](https://github.com/antelm-dev/mmx-studio/issues/75)).

## Décisions

- **Aucune URL tierce dans l'application.** Studio ne pointe vers aucun site de
  rips ni d'hébergement. Raison : il ne doit ni distribuer d'assets Capcom ni y
  orienter ; l'utilisateur apporte ce qu'il a.
- **Aucun asset Capcom dans les dépôts.** Code, données de conception et tests
  sur données synthétiques seulement ; les oracles ne tournent que sur une
  machine qui a les installs. Raison : les dépôts restent publiables et le
  projet reste un outil, pas une copie.
- **L'import Steam est la source de référence.** Quand le jeu est possédé, ses
  données exactes priment sur une planche refaite. Raison : il lit sur place
  les fichiers que l'utilisateur a achetés, sans rien extraire ni redistribuer
  (voir [zero-import.md](zero-import.md#legal-route)).
- **Packs communautaires avec crédits obligatoires.** Un pack sans
  `credits.sources` est refusé, et les packs sont distribués par les
  utilisateurs, jamais par le projet. Raison : les auteurs des planches sont
  cités, et chacun sait d'où vient ce qu'il importe.
- **Mention et procédure de retrait.** Texte unique (C-NOTICE, FR/EN) : les
  personnages et l'univers Mega Man sont © Capcom ; projet de fans non affilié,
  gratuit, aucun asset Capcom distribué ; retrait sur demande par issue GitHub.
  Il apparaît dans « À propos », au premier lancement, dans les README et dans
  `CONTRIBUTING.md` ([#75](https://github.com/antelm-dev/mmx-studio/issues/75)).
  Raison : rendre le cadre visible et donner aux ayants droit une voie de
  retrait simple.

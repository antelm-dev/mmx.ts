# Versioning avec Changesets

Ce monorepo utilise [Changesets](https://github.com/changesets/changesets) pour
calculer les versions des packages `packages/*` selon le
[Semantic Versioning](https://semver.org/).

La publication npm n’est **pas** configurée pour l’instant : Changesets sert
uniquement à versionner, générer les changelogs et ouvrir une pull request de
version depuis la CI.

## Packages concernés

| Inclus (versionnés)           | Ignorés (apps) |
| ----------------------------- | -------------- |
| `@mmx/asset-schema`           | `@mmx/web`     |
| `@mmx/browser-audio`          | `@mmx/desktop` |
| `@mmx/content-contracts`      | `@mmx/sim`     |
| `@mmx/content-engine-adapter` | `@mmx/studio`  |
| `@mmx/content-schema`         |                |
| `@mmx/editor-runtime`         |                |
| `@mmx/engine`                 |                |
| `@mmx/ldtk-tools`             |                |
| `@mmx/renderer-pixi`          |                |
| `@mmx/slope-tools`            |                |

Les packages restent `private: true`. Changesets les versionne quand même grâce
à `privatePackages.version` dans `.changeset/config.json`.

## Créer un changeset

Après une modification utilisateur-visible dans un package versionné :

```bash
pnpm changeset
```

1. Sélectionner le ou les packages impactés.
2. Choisir le bump SemVer :
   - **patch** — correction rétrocompatible (bugfix, typo, perf interne)
   - **minor** — nouvelle fonctionnalité rétrocompatible
   - **major** — rupture de compatibilité (API retirée/renommée, comportement
     incompatible)
3. Rédiger un résumé en une phrase (apparaîtra dans le `CHANGELOG.md`).

Le fichier créé sous `.changeset/*.md` doit être commité avec la PR.

Vérifier l’état :

```bash
pnpm changeset:status
```

## Changelog

À l’application des versions (`pnpm version-packages`), Changesets met à jour
`CHANGELOG.md` dans chaque package bumpé.

Le générateur `@changesets/changelog-github` ajoute, quand les métadonnées sont
disponibles (CI GitHub ou `GITHUB_TOKEN` local), les liens vers les PRs et les
contributeurs. Sans token GitHub, le changelog reste lisible : seules les
enrichissements PR/auteur peuvent manquer.

## Canal de préversion `next`

Pendant un découplage ou une série de changements non stables, utiliser le mode
prerelease Changesets avec le tag `next`.

### Entrer en mode `next`

```bash
pnpm version:enter-next
```

Cela crée `.changeset/pre.json`. Les prochains `pnpm version-packages`
produisent des versions du type `1.1.0-next.0`, puis `1.1.0-next.1`, etc.

Le script s’appelle `version-packages` (et non `version`) pour éviter le
conflit avec la commande intégrée `pnpm version` / `npm version`.

### Boucle habituelle en préversion

```bash
pnpm changeset           # décrire le changement
pnpm version-packages    # appliquer 1.1.0-next.N + CHANGELOG
git commit -am "version: prerelease next"
```

Répéter à chaque lot de changements.

### Quitter le mode `next` pour préparer le stable

Quand le découplage est terminé :

```bash
pnpm version:exit-next   # retire .changeset/pre.json
pnpm changeset           # éventuellement un dernier résumé
pnpm version-packages    # passe de 1.1.0-next.N → 1.1.0
```

## Pull request de version (CI)

Le workflow [`.github/workflows/version.yml`](../.github/workflows/version.yml)
tourne sur `master` :

1. installe les dépendances avec le lockfile figé ;
2. exécute lint, format, tests et build (même garde-fous que la CI principale,
   hors jobs desktop/studio lourds) ;
3. lance [changesets/action](https://github.com/changesets/action) **sans
   publication** ;
4. s’il existe des changesets en attente, ouvre ou met à jour une PR
   « Version Packages » qui contient les bumps de version et les changelogs.

Fusionner cette PR applique les versions sur `master`. Aucun package n’est
publié sur un registry.

Permissions minimales : `contents: write`, `pull-requests: write` (via
`GITHUB_TOKEN`).

## Scripts root

| Script                    | Rôle                                 |
| ------------------------- | ------------------------------------ |
| `pnpm changeset`          | créer un changeset                   |
| `pnpm changeset:status`   | lister les changesets / bumps prévus |
| `pnpm version-packages`   | appliquer les bumps + changelogs     |
| `pnpm version:enter-next` | entrer en mode préversion `next`     |
| `pnpm version:exit-next`  | quitter le mode préversion           |

## Diagnostic

| Symptôme                               | Piste                                                                                    |
| -------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm version-packages` ne change rien | aucun changeset, ou packages concernés dans `ignore`                                     |
| PR de version absente                  | pas de changeset sur `master`, ou workflow `Version` en échec                            |
| Changelog sans liens PR                | normal hors CI sans `GITHUB_TOKEN`                                                       |
| Versions `*-next.*` après un exit      | vérifier que `.changeset/pre.json` a bien disparu, puis relancer `pnpm version-packages` |
| App bumpée par erreur                  | les apps sont dans `ignore` ; ne pas les sélectionner dans `pnpm changeset`              |

## Hors scope (pour plus tard)

- Publication npm / GitHub Packages
- Dist-tags `latest` / `next`
- Trusted publishing OIDC
- `publishConfig` et packages non-`private`

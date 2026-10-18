# @mmx/pack-mmx-starter

The **MMX Starter** data pack: the Mega Man X objects the engine is moving out of
its built-in data — Metool, Bat and Pantheon Hunter (with `pantheon_shot`), the
four Life / Weapon Energy capsules, the moving and falling platforms and the
conveyor. Once phase 2 removes them from the engine, it keeps only behaviours and
the course primitives (`spawn`, `camera-zone`, `hazard`, slopes).

## Layout

A pack is a folder with:

| File             | Content                                                                      |
| ---------------- | ---------------------------------------------------------------------------- |
| `pack.json`      | `{ id, name, version }`                                                      |
| `data/game.json` | A `GameDataOverlay` (`@mmx/engine/data`) merged over the base by id          |
| `assets.json`    | `{ assets }`: the pack's 12 project manifest entries (sprites, animations)   |
| `assets/`        | The files those entries name, at the same project-relative paths             |
| `bindings.json`  | `enemyAnimations` / `pickupAnimations` keys for a project's `game/data.json` |
| `ATTRIBUTION.md` | Where the art comes from                                                     |

Each object ships its prefab and the enemy, actor, pickup, environment and
projectile records it uses, with the built-in values and sheet names.

## Assets

The pack owns the Metool and Bat sheets and the four capsule sheets, with their
`enemy_anims.json` / `pickup_anims.json`. X's sprites belong to the MMX — X pack
(`packages/pack-mmx-player-x`); shared art (shots and effects, HUD, sounds, font)
stays in the Studio templates.

The Studio templates `mmx-starter` and `mmx-demo` keep physical copies (Studio
bundles the template and ships only `out/**`). Refresh them from the pack with:

```bash
cd apps/studio
node scripts/starter-template/build-enemies.mjs [path-to-godot-project]  # optional, rebuilds assets/
node scripts/starter-template/build-pickups.mjs [path-to-godot-project]  # optional, rebuilds assets/
node scripts/starter-template/generate-manifest.mjs  # writes assets.json, both project.json, copies assets/
```

Studio's `tests/starter-template/pack-assets.test.ts` fails if a template's copy
or manifest entry differs from the pack by a byte.

```ts
import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };
import { mergeGameData } from "@mmx/engine/data";

const merged = mergeGameData(base, pack);
```

## Installing into a project

`mergePack` (`@mmx/content-schema`) adds what this pack has and a project lacks:
records, keys missing from a record, manifest entries and binding keys. It never
replaces a value and returns `{ added, skipped }`. Studio's File → Install /
update MMX packs… runs it for this pack and the X and Zero packs and copies the
missing `assets/` files, keeping any file of the project's own.

## Status

Phase 1: the built-in records still live in the engine, and the engine test
`tests/pack-mmx-starter.test.ts` fails if this pack and them diverge (base
without the pack + pack must equal `GAME_DATA`, hash `36e5bb6d8c3547a6`). In
phase 2 the pack becomes the source and is copied into each new project.

## Development

```bash
pnpm --filter @mmx/pack-mmx-starter test
```

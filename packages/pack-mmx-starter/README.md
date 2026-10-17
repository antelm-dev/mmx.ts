# @mmx/pack-mmx-starter

The **MMX Starter** data pack: the Mega Man X objects the engine no longer owns —
Metool, Bat and Pantheon Hunter (with `pantheon_shot`), the four Life / Weapon
Energy capsules, the moving and falling platforms and the conveyor. The engine
keeps only behaviours and the course primitives (`spawn`, `camera-zone`,
`hazard`, slopes).

## Layout

A pack is a folder with:

| File             | Content                                                             |
| ---------------- | ------------------------------------------------------------------- |
| `pack.json`      | `{ id, name, version }`                                             |
| `data/game.json` | A `GameDataOverlay` (`@mmx/engine/data`) merged over the base by id |

Each object ships its prefab and the enemy, actor, pickup, environment and
projectile records it uses, with the built-in values and sheet names. Assets come
in phase 2.

```ts
import pack from "@mmx/pack-mmx-starter/data/game.json" with { type: "json" };
import { mergeGameData } from "@mmx/engine/data";

const merged = mergeGameData(base, pack);
```

## Status

Phase 1: the built-in records still live in the engine, and the engine test
`tests/pack-mmx-starter.test.ts` fails if this pack and them diverge (base
without the pack + pack must equal `GAME_DATA`, hash `36e5bb6d8c3547a6`). In
phase 2 the pack becomes the source and is copied into each new project.

## Development

```bash
pnpm --filter @mmx/pack-mmx-starter test
```

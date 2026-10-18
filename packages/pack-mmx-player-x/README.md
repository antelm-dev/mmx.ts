# @mmx/pack-mmx-player-x

The **MMX — X** data pack: the player X as content. It holds the `player.x`
actor, its 15 `player.*` abilities, the `player.x` loadout, the `buster` and
`dark_arrow` weapons and the shots they fire (`lemon`, `medium`, `charged`,
`dark_arrow`), with the built-in values.

## Layout

| File             | Content                                                                        |
| ---------------- | ------------------------------------------------------------------------------ |
| `pack.json`      | `{ id, name, version }`                                                        |
| `data/game.json` | Records by category (actors, abilities, loadouts, weapons, projectiles), by id |

Data only: X's sprites and sounds stay in the Studio templates for now.

## Status

Phase 1: the built-in records still live in the engine, and the engine test
`tests/pack-mmx-players.test.ts` fails if this pack and them diverge (core
without the players + MMX Starter + X + Zero must equal the built-in data, hash
`36e5bb6d8c3547a6`); the test applies the packs with `mergeGameData`, as a
project overlay.

## Development

```bash
pnpm --filter @mmx/pack-mmx-player-x test
```

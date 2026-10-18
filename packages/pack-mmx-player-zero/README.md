# @mmx/pack-mmx-player-zero

The **MMX — Zero** data pack: the player Zero as content. It holds the
`player.zero` actor, its 12 `zero.*` abilities and the `player.zero` loadout,
with the built-in values. Zero has no weapon yet.

## Layout

| File             | Content                                                  |
| ---------------- | -------------------------------------------------------- |
| `pack.json`      | `{ id, name, version }`                                  |
| `data/game.json` | Records by category (actors, abilities, loadouts), by id |

Data only: Zero's sprites stay with the Studio Zero import for now.

## Status

Phase 1: the built-in records still live in the engine, and the engine test
`tests/pack-mmx-players.test.ts` fails if this pack and them diverge (core
without the players + MMX Starter + X + Zero must equal the built-in data, hash
`36e5bb6d8c3547a6`); the test applies the packs with `mergeGameData`, as a
project overlay.

## Development

```bash
pnpm --filter @mmx/pack-mmx-player-zero test
```

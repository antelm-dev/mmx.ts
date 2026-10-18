---
"@mmx/studio": minor
---

Projects carry the player packs. Both templates' `data/game.json` hold the MMX Starter, X and Zero records and their `project.json` the three `packs` markers, written by `generate-manifest.mjs`, which also copies X's art from `@mmx/pack-mmx-player-x` (`build-anims.mjs` now writes into that pack); the game data hash stays `36e5bb6d8c3547a6`. File → Install / update MMX packs… (was "MMX Starter pack") also installs what the X and Zero packs have and the project lacks: their records, X's art (bundled under `out/main/packs/mmx-player-x`) and his bindings, with the same confirmation and nothing replaced. Problems shows game data compile warnings (`game-data.player.missing`, `game-data.loadout.airControl`) as warnings.

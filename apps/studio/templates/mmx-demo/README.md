# MMX Core Demo Project

Runnable demo project for the MMX engine. It contains the Stage 1 regression
level, the larger mechanics demo, and the gameplay assets, animation metadata,
sounds, and UI font needed by the browser client.

Run it from the repository root with:

```powershell
pnpm demo
```

Open this directory in Studio to inspect or edit either level.

## Layout

```text
project.json          Portable manifest with stable logical asset IDs
game/data.json        Gameplay bindings from engine keys to manifest IDs
levels/               Level documents
assets/sprites/       Sprite sheets and animation source JSON
assets/sounds/        Sound effects
assets/fonts/         UI typefaces
ATTRIBUTION.md        Third-party and fan-work attribution
```

## Maintaining assets

The shared assets come from `templates/mmx-starter`, the Metool, Bat and
capsule art from the MMX Starter pack (`packages/pack-mmx-starter`) and X's
sprites from the MMX — X pack (`packages/pack-mmx-player-x`).
`generate-manifest.mjs` writes this project's `project.json` and `data/game.json`
(the Starter, X and Zero packs' records) and copies the packs' files here, as
for the starter. From `apps/studio`:

```powershell
node scripts/starter-template/build-anims.mjs [path-to-godot-project]  # writes into the X pack
node scripts/starter-template/build-enemies.mjs [path-to-godot-project]
node scripts/starter-template/build-pickups.mjs [path-to-godot-project]
node scripts/starter-template/build-shots.mjs [path-to-godot-project]
node scripts/starter-template/generate-manifest.mjs
```

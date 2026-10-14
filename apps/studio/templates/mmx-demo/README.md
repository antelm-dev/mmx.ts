# MMX Core Demo Project

Runnable demo project for `mmx-core-ts`. It contains the Stage 1 regression
level, the larger mechanics demo, and the gameplay assets, animation metadata,
sounds, and UI font needed by the browser client.

Run it from the sibling `mmx-core-ts` checkout with:

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

The assets are copied from `templates/mmx-starter`; its animation metadata
generators live in `scripts/starter-template/`. Refresh the starter assets first,
then copy the resulting files into this project.

```powershell
cd mmx-studio
node scripts/starter-template/build-anims.mjs [path-to-godot-project]
node scripts/starter-template/build-enemies.mjs [path-to-godot-project]
node scripts/starter-template/build-pickups.mjs [path-to-godot-project]
node scripts/starter-template/build-shots.mjs [path-to-godot-project]
```

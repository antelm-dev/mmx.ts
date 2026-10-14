# MMX Starter Project

Versioned starter template shipped with MMX Studio. It contains the default Mega
Man X gameplay assets, animation metadata, sounds, UI font, and a blank entry
level.

Studio copies this tree into a user project directory when creating a project
from the MMX starter template. Do not edit this template in place from Studio.

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

Animation metadata generators live in `scripts/starter-template/`.
After refreshing animation JSON from a Godot export:

```powershell
cd mmx-studio
node scripts/build-anims.mjs [path-to-godot-project]
node scripts/build-enemies.mjs [path-to-godot-project]
node scripts/build-pickups.mjs [path-to-godot-project]
node scripts/build-shots.mjs [path-to-godot-project]
node scripts/generate-manifest.mjs
```

To re-copy binary assets from the core resource tree during migration work:

```powershell
node scripts/sync-resources.mjs
node scripts/generate-manifest.mjs
```

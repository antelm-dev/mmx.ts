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

This template lives in the MMX Studio repository (`apps/studio/templates/`). The
Metool, Bat and capsule art belongs to the MMX Starter pack
(`packages/pack-mmx-starter`); this tree keeps a copy. After refreshing animation
JSON from a Godot export, from `apps/studio`:

```powershell
node scripts/starter-template/build-anims.mjs [path-to-godot-project]
node scripts/starter-template/build-enemies.mjs [path-to-godot-project]  # writes into the pack
node scripts/starter-template/build-pickups.mjs [path-to-godot-project]  # writes into the pack
node scripts/starter-template/build-shots.mjs [path-to-godot-project]
node scripts/starter-template/generate-manifest.mjs  # both templates' project.json, copies the pack's files
```

A project that lacks the pack's art or bindings gets them from Studio's
File → Install / update MMX Starter pack…, which adds what is missing and never
replaces a file or value.

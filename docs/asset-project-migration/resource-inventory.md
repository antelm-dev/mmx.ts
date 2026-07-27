# Resource inventory — core removal (prompt 07)

Confirmed on 2026-07-27: every binary under `resources/` in mmx-core-ts has a
matching file in the Studio starter project at
`mmx-studio/templates/mmx-starter/assets/` (61 assets validated with
`@mmx/project-schema`).

## Replacement ownership

| Core path (deleted) | Studio starter path |
| --- | --- |
| `resources/fonts/mega-man-x.ttf` | `templates/mmx-starter/assets/fonts/mega-man-x.ttf` |
| `resources/sprites/player/*` | `templates/mmx-starter/assets/sprites/player/*` |
| `resources/sprites/enemies/*` | `templates/mmx-starter/assets/sprites/enemies/*` |
| `resources/sprites/effects/*` | `templates/mmx-starter/assets/sprites/effects/*` |
| `resources/sprites/hud/*` | `templates/mmx-starter/assets/sprites/hud/*` |
| `resources/sprites/pickups/*` | `templates/mmx-starter/assets/sprites/pickups/*` |
| `resources/sounds/player/*` | `templates/mmx-starter/assets/sounds/player/*` |
| `resources/sounds/weapons/*` | `templates/mmx-starter/assets/sounds/weapons/*` |
| `resources/sounds/enemies/*` | `templates/mmx-starter/assets/sounds/enemies/*` |
| `resources/sounds/pickups/*` | `templates/mmx-starter/assets/sounds/pickups/*` |

Generator scripts moved to `mmx-studio/packages/starter-template/scripts/`:

| Core script (deleted) | Studio script |
| --- | --- |
| `scripts/build-anims.mjs` | `packages/starter-template/scripts/build-anims.mjs` |
| `scripts/build-enemies.mjs` | `packages/starter-template/scripts/build-enemies.mjs` |
| `scripts/build-pickups.mjs` | `packages/starter-template/scripts/build-pickups.mjs` |
| `scripts/build-shots.mjs` | `packages/starter-template/scripts/build-shots.mjs` |

Additional Studio-only tooling: `generate-manifest.mjs`, `sync-resources.mjs`,
`validate-export.mjs`.

## Engine test fixtures

`packages/engine/tests/fixtures/x_anims.json` is a minimal player animation
fixture retained for isolated engine tests. It is not served as game content.

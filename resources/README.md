# Game resources

Runtime game assets live here independently of the package that consumes them.
Vite fingerprints imported files when it builds the web client; the desktop app
wraps that same output, while the headless simulator does not load this directory.

```text
sprites/
  player/    Player atlases and animation metadata
  enemies/   Enemy sheets and animation metadata
  effects/   Projectiles, impact effects and charge/dash effects
  pickups/   Pickup sheets and animation metadata
  hud/       HUD textures
sounds/
  player/    Movement, damage and death sounds
  weapons/   Charge and projectile sounds
  enemies/   Enemy, shield and guard sounds
  pickups/   Pickup sounds
fonts/       UI typefaces
```

Generated sprite sheets and metadata are refreshed by the import scripts in
`scripts/`. Keep JSON sheet values as bare filenames: the renderer maps those
logical names to the nested files in `resources/sprites/`.

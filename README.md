# mmx.ts

A faithful **TypeScript / Node** port of the _core player gameplay_ from the
[Mega Man X8 16-bit](https://github.com/AlyssonDaPaz/Mega-Man-X8-16-bit) Godot project — the movement state
machine (walk / dash / variable jump / air-dash / wall-slide / wall-jump /
dash-jump), hurt/knockback, plus buster shooting and charge shots.

The engine is **pure TypeScript** with no runtime dependencies. It runs three ways:

- **Headless** in Node (deterministic, scripted input) — `pnpm sim`
- **In the browser** on a canvas with real keyboard input — `pnpm play`
- **As a desktop app** through Tauri 2 — `pnpm desktop:dev`

---

## Quick start

```bash
pnpm install

pnpm sim          # deterministic headless simulation, prints a state trace
pnpm test         # unit tests (node:test) for gameplay behaviour
pnpm play         # Vite development server -> http://localhost:5173
pnpm editor       # MMX Studio, the visual level editor -> http://localhost:5174
pnpm editor:build # type-check + production build of the editor
pnpm desktop:dev    # launch the desktop app with Vite hot reload
pnpm desktop:build  # build the native executable and platform installers
```

**MMX Studio** (`apps/editor`) is a visual level editor: open Stage 1/2, place and
edit every authored entity, validate, and play-test with the real engine + Pixi
renderer. It works on an editor-friendly `LevelDocument` (see
[`packages/content-schema`](packages/content-schema)) and never touches the
generated level modules. See [`apps/editor/README.md`](apps/editor/README.md).

Controls (browser and desktop): **← →** / **A D** move · **Space** jump (hold for height) ·
**Shift** / **L** dash · **J** fire (tap = lemon, hold+release = charged) ·
hold _into_ a wall while falling to wall-slide, then **Space** to wall-kick.

### Browser debugging and GPU profiling

- Press **F1**, or open the game with `?profile`, for a rolling 240-frame graph and
  median / p95 / worst timings. `frame` is the animation-frame interval; `sim`,
  `render`, and `work` isolate CPU time spent in each part of the loop.
- Press **F2** for collision geometry and **F3** for the interactive animation
  inspector. The inspector can pause/step, select clips, scrub frames, swap the
  normal/cannon atlas, show frame timing and regions, and outline sprite bounds.
- Chrome/Edge Performance recordings include `mmx:simulation`, `mmx:render`, and
  `mmx:frame-work` User Timing measures. Use the Memory panel for heap snapshots
  and allocation sampling during longer runs.
- For difficult WebGL frames, load Spector.js and capture the game canvas. The
  Pixi application, renderer, and canvas are available at `window.__mmxRenderer`
  for console inspection and targeted captures.
- Compare median, p95, and worst frame time after a representative run. Average
  FPS alone hides intermittent long frames.

### Desktop prerequisites

The desktop shell uses **Tauri 2** and leaves the TypeScript engine and PixiJS
renderer unchanged. Install Rust plus the native prerequisites for your operating
system before using the desktop commands. On Windows that means Microsoft C++ Build
Tools and WebView2; current Windows releases normally already include WebView2.

Production artifacts are written below `apps/desktop/src-tauri/target/release/`. Windows builds
produce the standalone executable along with MSI and NSIS installers under
`apps/desktop/src-tauri/target/release/bundle/`.

### Desktop integration

The Tauri build adds a small native layer without moving gameplay out of the
shared TypeScript engine:

- **U / O** use native Save/Open dialogs for deterministic replay files. Dialogs
  start in the app's platform-specific `replays` data directory; dropping a replay
  JSON file onto the desktop window loads it too.
- **F8** toggles automatic pause when the window loses focus.
- **F9 / F10** lower or raise master volume in 10% steps.
- **F11** toggles fullscreen.

Volume, fullscreen and focus-pause preferences are validated by Rust and stored
as `settings.json` in the operating system's application-data directory. The web
build keeps the same controls and falls back to `localStorage`, browser file
pickers/downloads and the browser Fullscreen API.

Native filesystem access is intentionally confined to commands in
`apps/desktop/src-tauri/src/lib.rs`. Replay contents still pass through the strict TypeScript
decoder before they can replace a running scene, keeping one authority for the
on-disk replay format.

---

## How the original works (analysis)

The Godot player **X** is a chain of classes, each adding one concern:

```
CharacterBody2D
 └ Actor.gd         physics body: velocity + bonus_velocity, gravity 900,
 │                  max fall 375, floor snap, health, facing
 └ AbilityUser.gd   moveset of ability nodes; each frame it tries to start every
 │                  eligible ability and updates the ones already running
 └ Character.gd     input reading, wall/land/headbump detection (RayCast2D columns)
 └ Player.gd        armor, dashfall, dashjump counters, hazards
```

**Movement is not a classic exclusive FSM.** Each move is a child node
(`BaseAbility`) in `moveset`. Every physics frame:

1. every ability tests `_StartCondition()` + `Should_Execute()` (input);
2. if it passes it `ExecuteOnce()` → `Initialize` → `_Setup`, interrupting
   conflicting moves;
3. running moves call `_Update` until `_EndCondition()` fires (`EndAbility` →
   `Finalize` → `_Interrupt`).

Conflicts between moves are handled by per-ability `conflicting_moves` arrays and
priorities. Independent moves (Shot, Charge — configured "Nothing") run
_concurrently_ with movement, which is why you can walk-and-charge.

Ability lifecycle (`BaseAbility.gd`):

```
ExecuteOnce ─ Initialize ─ _Setup ─┐
                                    ├─ each frame: BeforeEveryFrame ─┬ _ResetCondition → ResetAbility
                                    │                                ├ _EndCondition   → EndAbility
                                    └────────────────────────────────┴ else            → _Update
EndAbility ─ Finalize ─ _Interrupt
```

Key numbers (all reproduced in [`packages/engine/src/core/constants.ts`](packages/engine/src/core/constants.ts)):
gravity `900`, max fall `375`, walk `90`, jump `320`, dash `~200`, dash duration
`0.55s`, jump max time `0.625s`, jump buffer `0.1s`, charge thresholds
`0.5 / 1.75 / 2.75s`.

---

## How this port maps to it

| Godot source                                                                   | This project                                                                                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Actor.gd` (physics, health, sensors)                                          | [`packages/engine/src/game/Actor.ts`](packages/engine/src/game/Actor.ts)                                                                                  |
| `move_and_slide()` + `RayCast2D` columns                                       | [`packages/engine/src/game/World.ts`](packages/engine/src/game/World.ts) AABB tile collision + edge sensors                                               |
| `AbilityUser.gd` (moveset + runtime)                                           | [`packages/engine/src/game/AbilityUser.ts`](packages/engine/src/game/AbilityUser.ts)                                                                      |
| `Character.gd` (input, wall/land)                                              | [`packages/engine/src/game/Character.ts`](packages/engine/src/game/Character.ts)                                                                          |
| `Player.gd` / `Player.tscn` node list                                          | [`packages/engine/src/game/Player.ts`](packages/engine/src/game/Player.ts)                                                                                |
| `BaseAbility.gd` / `Ability.gd` / `Movement.gd`                                | [`packages/engine/src/game/ability/`](packages/engine/src/game/ability/)                                                                                  |
| `Idle/Walk/Fall/Jump/Dash/AirDash/Wallslide/Walljump/DashWallJump/DashJump.gd` | [`packages/engine/src/game/abilities/`](packages/engine/src/game/abilities/)                                                                              |
| `Shot.gd` (PrimaryShot) / `Charge.gd`                                          | [`packages/engine/src/game/abilities/Shot.ts`](packages/engine/src/game/abilities/Shot.ts), [`Charge.ts`](packages/engine/src/game/abilities/Charge.ts) |
| `Damage.gd` (hurt, knockback, invulnerability)                                 | [`packages/engine/src/game/abilities/Damage.ts`](packages/engine/src/game/abilities/Damage.ts)                                                            |
| `PlayerDeath.gd` (trimmed — see the file for what was dropped)                 | [`packages/engine/src/game/abilities/Death.ts`](packages/engine/src/game/abilities/Death.ts)                                                              |
| `Lemon.gd` / `WeaponShot.gd`                                                   | [`packages/engine/src/game/Projectile.ts`](packages/engine/src/game/Projectile.ts)                                                                        |
| `Enemy.gd` + `EnemyShield` / `EnemyDamage` / `EnemyDeath` / `DamageOnTouch`    | [`packages/engine/src/game/Enemy.ts`](packages/engine/src/game/Enemy.ts)                                                                                  |
| `AI.gd` (event -> ability lists)                                               | [`packages/engine/src/game/EnemyAI.ts`](packages/engine/src/game/EnemyAI.ts)                                                                              |
| `EnemyAbility.gd` / `AttackAbility.gd`                                         | [`packages/engine/src/game/enemy/EnemyAbility.ts`](packages/engine/src/game/enemy/EnemyAbility.ts)                                                        |
| `CrabPatrol` / `Hide` / `EnemyStun` / `BeePatrol` / `BatPursuit` / `BatJump`   | [`packages/engine/src/game/enemy/`](packages/engine/src/game/enemy/)                                                                                      |
| `Metool.tscn` / `SmallBat.tscn` node lists                                     | [`packages/engine/src/game/enemies/index.ts`](packages/engine/src/game/enemies/index.ts)                                                                  |
| Area2D layer/mask overlaps (shots, contact damage)                             | [`packages/engine/src/game/Stage.ts`](packages/engine/src/game/Stage.ts)                                                                                  |
| `AnimatedSprite2D` playback + `x.res` / `x_leftarm.res`                        | [`packages/engine/src/game/Animation.ts`](packages/engine/src/game/Animation.ts)                                                                          |
| Godot `Input` singleton                                                        | [`packages/engine/src/core/Input.ts`](packages/engine/src/core/Input.ts)                                                                                      |
| Godot signals                                                                  | [`packages/engine/src/core/Events.ts`](packages/engine/src/core/Events.ts)                                                                                    |

The per-state logic (`_StartCondition` / `_Update` / `_EndCondition`) and every
tuning constant are ported line-for-line so the _feel_ matches.

### Deliberate divergences

- **Conflict resolution.** `Player.tscn` does declare `conflicting_moves` per ability
  node (see the table below), but this port does not run the original's
  substring/priority interpreter. Instead each ability carries
  `independent` (Shot/Charge run concurrently) and a `priority`; `AbilityUser`
  keeps exactly one locomotion state active, with a higher-priority candidate (or
  the current state's `_EndCondition`) driving transitions. This reproduces the
  intended ordering **Idle < Walk/Fall < WallSlide < Dash/AirDash < Jump <
  DashJump < WallJump/DashWallJump** (wall context outranks grounded moves).
- **Collision** uses tile AABBs for static terrain; the raycast
  wall/reach queries become edge samples. Ramps are supported up to 45 degrees:
  a slope tile carries a linear surface between its two edge heights, and
  shallower ramps are a run of tiles whose surfaces chain. Level designers draw
  them as resizable `Slope` boxes in LDtk — width is the run, height the rise —
  which `@mmx/ldtk-tools` expands into those tiles at import.
- **Interactive terrain** is authored as LDtk entities. `Conveyor` strips add
  signed ground velocity, `MovingPlatform` boxes patrol horizontally as one-way
  floors and carry their riders, and `Hazard` boxes bypass ordinary damage
  protection to start the death/restart sequence immediately.
- **Some cosmetics remain scoped**: the player/enemy effects used by the current
  room and their original sounds are ported; unrelated shaders are not. Animation
  is engine state rather than a cosmetic — see below.

### Animation

The sprite is part of the engine, not the renderer, because the original's abilities
read it back: `Movement.change_animation_if_falling` tests `get_animation() != "fall"`,
`Walk` advances `walk_start -> walk` on Godot's `animation_finished` signal, and
`IdleWeak` settles `recover -> idle` (or `weak` at low health) the same way.
[`Animation.ts`](packages/engine/src/game/Animation.ts) reproduces `AnimatedSprite2D` playback —
clip, frame index, loop/hold, `animation_finished` — and `AbilityUser` exposes the
same `play_animation` / `get_animation` / `set_animation_layer` API as the Godot node.

Each ability names its clip in an `animation` field, taken from the exported node in
`Player.tscn` (or `Idle.tscn` / `Fall.tscn`):

| Ability                   | Clip       | Notes                                                  |
| ------------------------- | ---------- | ------------------------------------------------------ |
| Idle                      | `recover`  | settles to `idle` / `weak` when the clip finishes      |
| Walk                      | `walk`     | `walk_start` lead-in only when the last state was Idle |
| Fall                      | `fall`     | does _not_ restart if `fall` is already playing        |
| Jump / DashJump / AirJump | `jump`     | always restarts (overrides Fall's rule)                |
| Dash / AirDash            | `dash`     | the atlas' `airdash` clip is unused by X               |
| WallSlide                 | `slide`    |                                                        |
| WallJump / DashWallJump   | `walljump` |                                                        |

Shooting plays **no clip of its own**. `Shot.gd` swaps the whole SpriteFrames
resource (`x.res` -> `x_leftarm.res`, "pointing_cannon") while keeping the current
clip name _and_ frame index, so every state has an arm-out twin and X keeps walking,
jumping or wall-sliding with the buster raised. The port models this as an animation
_layer_: [`scripts/build-anims.mjs`](scripts/build-anims.mjs) writes both atlases' regions
into `x_anims.json`, and the renderer picks the sheet the layer asks for.

Clip data is optional. The headless sim and tests run without loading it — clips then
have no frames and finish on the next tick, so the handoffs still resolve and
`get_animation()` behaves like the plain string it used to be. The browser calls
`player.loadAnimations(...)` and gets real timing.

## Enemies

Two are ported, chosen to exercise opposite halves of the enemy framework: the
**Metool** (grounded, shielded, 2 HP) and the **SmallBat** (flying, fragile, 1 HP).

They do _not_ reuse the player's state machine. `AbilityUser` picks the player's
locomotion by a priority race between abilities that all want to run; an enemy's
state is chosen by [`EnemyAI`](packages/engine/src/game/EnemyAI.ts) from the event lists its
scene declares, and the abilities arbitrate between themselves using Godot's
`conflicting_moves` rules — which, unlike `Player.tscn`'s, _are_ present in the
enemy scenes, so they are ported as written rather than replaced:

| Godot             | Metool                               | Bat                                              |
| ----------------- | ------------------------------------ | ------------------------------------------------ |
| `on_idle`         | `Patrol` — walk a leg, rest, reverse | `Hover` — ease to a random point near its anchor |
| `on_see_player`   | `Hide` — helmet down, guard up       | `Pursuit` — swooping homing flight               |
| `on_touch_player` | —                                    | `Recoil` — hop up and away                       |
| `on_guard_break`  | `Stun` — 1.65s, wide open            | —                                                |

The Metool is the interesting one. It only comes out from under its helmet when the
player is _looking away_, so you cannot stand and shoot it: facing it is what keeps
it shut. While the guard is up the body cannot be damaged at all
(`Damage.ignore_hits_if_shield`), and a shot that lands on the shield is consumed
without doing anything — unless it is a **charged** shot, which breaks the guard and
routes to `Stun`, long enough to kill it outright.

`AI.gd`'s event lists are kept rather than hard-coded into each enemy because that
indirection is what lets both share one dispatcher: they differ only in which
ability answers which event.

### Enemy sprites

[`scripts/build-enemies.mjs`](scripts/build-enemies.mjs) (`pnpm enemies:import`)
builds `resources/sprites/enemies/enemy_anims.json` from the Godot project's **Aseprite**
sidecars, not its `.res` SpriteFrames — the enemies still have their source
`.json` checked in, and it carries per-frame atlas rects, per-frame durations in
milliseconds, and `meta.frameTags` naming the clips. The one thing it cannot carry
is whether a clip loops, which lives in the Godot resource; that is declared in the
script and is load-bearing rather than cosmetic (a looping `stun` would leave a
Metool stunned forever, since `EnemyStun` advances on `animation_finished`).

### Not ported (extension points)

Documented but out of scope: armor sets (Hermes / Icarus and their gameplay
modifiers), boss weapons, Ride Armor, sub-tanks, and the AirJump double-jump.
The ability framework is built to accept these as additional `BaseAbility`
subclasses exactly as the original does.

---

## Project layout

The active `MechanicsDemo` level is authored in `levels/stage2.ldtk`. At 160x48
tiles it combines the complete movement kit with three moving bridges, conveyor
runs, a lethal spike pit, several ramp gradients, wall-jump shafts, upper
air-dash routes, camera zones, and both enemy types. Run `pnpm level:import` after
editing an LDtk project to regenerate the engine level modules. The original
`Stage1` remains as the compact movement regression level.

```
packages/
  engine/             dependency-free simulation package
    src/core/         Vec2, Input, EventBus, replay format, constants
    src/game/       world, actors, abilities, enemies, scene and level data
    tests/            node:test gameplay and determinism tests
  renderer-pixi/      PixiJS game renderer and visual effects
  ldtk-tools/         LDtk project import/export used to author levels/
apps/
  web/                browser composition, input, audio, UI and debug tools
  sim/                deterministic headless runner and replay CLI
  desktop/            Tauri shell around the web app
levels/               LDtk and authored level sources
resources/            Shared sprites, sounds, fonts and animation metadata
scripts/              animation/sprite asset importers and demo-stage authoring
```

The workspace dependency is intentionally one-way: `@mmx/renderer-pixi` depends
on `@mmx/engine`, while `@mmx/web` composes both packages. The simulator depends
only on the engine, and the engine has no browser, rendering, or native-shell
dependency. Run commands from the repository root so pnpm can select the correct
workspace project.

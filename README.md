# mmx.ts

A faithful **TypeScript / Node** port of the _core player gameplay_ from the
[Mega Man X8 16-bit](https://github.com/AlyssonDaPaz/Mega-Man-X8-16-bit) Godot project — the movement state
machine (walk / dash / variable jump / air-dash / wall-slide / wall-jump /
dash-jump), hurt/knockback, plus buster shooting and charge shots.

The engine is **pure TypeScript** with no runtime dependencies. It runs two ways:

- **Headless** in Node (deterministic, scripted input) — `pnpm sim -- --project <dir>`
- **In the browser** on a canvas with real keyboard input — `pnpm play`

---

## Quick start

```bash
pnpm install
pnpm playwright:install   # Chromium for the required cross-repo browser boot test

pnpm demo         # run the sibling Studio demo project in the browser
pnpm sim -- --project ../mmx-studio/templates/mmx-demo
pnpm test         # unit tests (node:test) for gameplay behaviour
pnpm build        # compile/typecheck packages (no production web artifact)
```

### Web project contract

Game sprites, sounds, fonts, and levels are **not** shipped inside this
repository. They come from a Studio project export (for example
`mmx-studio/templates/mmx-demo`). Core injects them at build time through
`@mmx/build-tools` when `MMX_PROJECT` points at that export.

| Command                                             | `MMX_PROJECT`                  | Behavior                                                                                                                                          |
| --------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm demo`                                         | set by command                 | Runs the sibling `mmx-studio/templates/mmx-demo` project with both converted levels.                                                              |
| `pnpm play` / `pnpm factory:dev -- --project <dir>` | optional / required by factory | Dev server. Without a project, `virtual:mmx-project` stubs to `null` and bootstrap fails at runtime with an actionable message.                   |
| `pnpm build`                                        | not required                   | Package/library validation only. Typechecks `@mmx/web` but does **not** run `vite build` or emit `apps/web/dist`.                                 |
| `pnpm build:web`                                    | **required**                   | Production web artifact. Fails at build time if `MMX_PROJECT` is unset or invalid. A successful build embeds a validated non-null project bundle. |
| `pnpm factory:build -- --project <dir>`             | via `--project`                | Compiles a Studio export to disk (`dist-project` by default); does not replace `build:web`.                                                       |

```bash
# PowerShell
$env:MMX_PROJECT = "E:\path\to\studio-export"
pnpm build:web

# bash
MMX_PROJECT=/path/to/studio-export pnpm build:web
```

CI (`pnpm build`) validates libraries without a game project. The `web-dist`
artifact is uploaded only when `MMX_PROJECT` is set for that workflow run, so a
knowingly non-bootable bundle is never labeled as a production web build.

### Cross-repo browser boot

`pnpm test:cross-repo` builds a Studio starter export and boots it in Chromium.
It requires a Studio checkout (`MMX_STUDIO_ROOT`, defaulting to
`../.worktrees/mmx-studio-assets-08`) plus Playwright Chromium from
`pnpm playwright:install`. Missing Playwright or Chromium fails the run; set
`MMX_SKIP_BROWSER_E2E=1` only when you intentionally want the optional skip path.

Strict local command:

```powershell
pnpm install --frozen-lockfile
pnpm playwright:install
$env:MMX_STUDIO_ROOT = 'E:\Adel\Documents\Orgs\.worktrees\mmx-studio-assets-08'
pnpm test:cross-repo
```

CI runs the same strict path in the `Cross-repo browser E2E` job when the
repository variable `MMX_STUDIO_REPO` is set (for example `org/mmx-studio`).
Optional companion settings:

- `MMX_STUDIO_REF` — Studio git ref (defaults to the repository default branch)
- secret `MMX_STUDIO_TOKEN` — checkout token when Studio is private

Without `MMX_STUDIO_REPO`, the cross-repo job is skipped; the required Test &
build job still runs. When the job does run, missing Playwright/Chromium fails.

### Versioning

Package versions in `packages/*` are managed with
[Changesets](https://github.com/changesets/changesets) (Semantic Versioning,
optional `next` prereleases, automatic changelogs, version PR on `master`).
See [`docs/releasing.md`](docs/releasing.md).

Controls: **← →** / **A D** move · **Space** jump (hold for height) ·
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

Preferences (volume, fullscreen, focus-pause) persist in `localStorage`. Replays
use browser file pickers/downloads; fullscreen uses the browser Fullscreen API.

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

| Godot source                                                                   | This project                                                                                                                                            |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Actor.gd` (physics, health, sensors)                                          | [`packages/engine/src/game/Actor.ts`](packages/engine/src/game/Actor.ts)                                                                                |
| `move_and_slide()` + `RayCast2D` columns                                       | [`packages/engine/src/game/World.ts`](packages/engine/src/game/World.ts) AABB tile collision + edge sensors                                             |
| `AbilityUser.gd` (moveset + runtime)                                           | [`packages/engine/src/game/AbilityUser.ts`](packages/engine/src/game/AbilityUser.ts)                                                                    |
| `Character.gd` (input, wall/land)                                              | [`packages/engine/src/game/Character.ts`](packages/engine/src/game/Character.ts)                                                                        |
| `Player.gd` / `Player.tscn` node list                                          | [`packages/engine/src/game/Player.ts`](packages/engine/src/game/Player.ts)                                                                              |
| `BaseAbility.gd` / `Ability.gd` / `Movement.gd`                                | [`packages/engine/src/game/ability/`](packages/engine/src/game/ability/)                                                                                |
| `Idle/Walk/Fall/Jump/Dash/AirDash/Wallslide/Walljump/DashWallJump/DashJump.gd` | [`packages/engine/src/game/abilities/`](packages/engine/src/game/abilities/)                                                                            |
| `Shot.gd` (PrimaryShot) / `Charge.gd`                                          | [`packages/engine/src/game/abilities/Shot.ts`](packages/engine/src/game/abilities/Shot.ts), [`Charge.ts`](packages/engine/src/game/abilities/Charge.ts) |
| `Damage.gd` (hurt, knockback, invulnerability)                                 | [`packages/engine/src/game/abilities/Damage.ts`](packages/engine/src/game/abilities/Damage.ts)                                                          |
| `PlayerDeath.gd` (trimmed — see the file for what was dropped)                 | [`packages/engine/src/game/abilities/Death.ts`](packages/engine/src/game/abilities/Death.ts)                                                            |
| `Lemon.gd` / `WeaponShot.gd`                                                   | [`packages/engine/src/game/Projectile.ts`](packages/engine/src/game/Projectile.ts)                                                                      |
| `Enemy.gd` + `EnemyShield` / `EnemyDamage` / `EnemyDeath` / `DamageOnTouch`    | [`packages/engine/src/game/Enemy.ts`](packages/engine/src/game/Enemy.ts)                                                                                |
| `AI.gd` (event -> ability lists)                                               | [`packages/engine/src/game/EnemyAI.ts`](packages/engine/src/game/EnemyAI.ts)                                                                            |
| `EnemyAbility.gd` / `AttackAbility.gd`                                         | [`packages/engine/src/game/enemy/EnemyAbility.ts`](packages/engine/src/game/enemy/EnemyAbility.ts)                                                      |
| `CrabPatrol` / `Hide` / `EnemyStun` / `BeePatrol` / `BatPursuit` / `BatJump`   | [`packages/engine/src/game/enemy/`](packages/engine/src/game/enemy/)                                                                                    |
| `Metool.tscn` / `SmallBat.tscn` node lists                                     | [`packages/engine/src/game/enemies/index.ts`](packages/engine/src/game/enemies/index.ts)                                                                |
| Area2D layer/mask overlaps (shots, contact damage)                             | [`packages/engine/src/game/Stage.ts`](packages/engine/src/game/Stage.ts)                                                                                |
| `AnimatedSprite2D` playback + `x.res` / `x_leftarm.res`                        | [`packages/engine/src/game/Animation.ts`](packages/engine/src/game/Animation.ts)                                                                        |
| Godot `Input` singleton                                                        | [`packages/engine/src/core/Input.ts`](packages/engine/src/core/Input.ts)                                                                                |
| Godot signals                                                                  | [`packages/engine/src/core/Events.ts`](packages/engine/src/core/Events.ts)                                                                              |

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
  them as resizable `Slope` objects in Studio — width is the run, height the rise —
  which the project compiler expands into those tiles.
- **Interactive terrain** is authored as Studio objects. `Conveyor` strips add
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
_layer_: the Studio starter template's `build-anims.mjs` writes both atlases' regions
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

Enemy animation metadata is generated from the Godot project's **Aseprite** sidecars
in `mmx-studio/packages/starter-template/scripts/build-enemies.mjs`, not from `.res`
SpriteFrames — the enemies still have their source `.json` checked in, and it carries
per-frame atlas rects, per-frame durations in milliseconds, and `meta.frameTags`
naming the clips. The one thing it cannot carry is whether a clip loops, which lives
in the Godot resource; that is declared in the script and is load-bearing rather
than cosmetic (a looping `stun` would leave a Metool stunned forever, since
`EnemyStun` advances on `animation_finished`).

### Not ported (extension points)

Documented but out of scope: armor sets (Hermes / Icarus and their gameplay
modifiers), boss weapons, Ride Armor, sub-tanks, and the AirJump double-jump.
The ability framework is built to accept these as additional `BaseAbility`
subclasses exactly as the original does.

---

## Project layout

The sibling `mmx-studio/templates/mmx-demo` project contains the active
`MechanicsDemo` and compact `Stage1` regression levels. The 160x48 mechanics
demo combines the complete movement kit with moving bridges, conveyor runs, a
lethal spike pit, ramp gradients, wall-jump shafts, upper air-dash routes,
camera zones, and both enemy types. Studio owns and exports those level
documents; core only compiles their portable project representation.

| Workspace                                                        | Role                                                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| [`packages/contracts`](packages/contracts/README.md)             | Dependency-free animation and terrain serialization contracts                        |
| [`packages/content-schema`](packages/content-schema/README.md)   | Studio authoring document model, commands, validation, and slope baking              |
| [`packages/project-schema`](packages/project-schema/README.md)   | Portable Studio project and asset-manifest contract                                  |
| [`packages/engine`](packages/engine/README.md)                   | Deterministic gameplay simulation, content compilation, and tooling snapshots        |
| [`packages/browser-input`](packages/browser-input/README.md)     | Keyboard/gamepad action input and packed engine masks                                |
| [`packages/client-settings`](packages/client-settings/README.md) | Versioned settings, migration, bindings, and injected persistence                    |
| [`packages/browser-audio`](packages/browser-audio/README.md)     | Web Audio asset resolution and gameplay event sounds                                 |
| [`packages/renderer-pixi`](packages/renderer-pixi/README.md)     | PixiJS renderer, presentation effects, asset catalogs, and debug geometry            |
| [`packages/runtime`](packages/runtime/README.md)                 | Shared session lifecycle, fixed-step scheduling, player, tooling, and host contracts |
| [`packages/build-tools`](packages/build-tools/README.md)         | Studio export loading, compilation, asset emission, and Vite integration             |
| `apps/web`                                                       | Browser composition, UI, settings adapters, and debug tools                          |
| `apps/sim`                                                       | Deterministic headless runner and replay CLI                                         |
| `scripts`                                                        | Import-boundary, packaging, and game-resource guard tests                            |

Game sprites, sounds, fonts, and animation metadata live in Studio project exports
(`mmx-studio/templates/mmx-demo`). Set `MMX_PROJECT` to that export directory
before `pnpm build:web`, or use `pnpm factory:dev -- --project <dir>` for local
play. See [Web project contract](#web-project-contract).

Workspace dependencies flow from small portable contracts and schemas toward
engine, browser adapters, presentation, runtime composition, and build tools.
The engine has no browser or rendering dependency. The Web app composes the
browser-facing packages; the simulator uses the engine plus `@mmx/build-tools`
to load an explicit Studio project. Run commands from the repository root so
pnpm can select the correct workspace project.

## Package import boundaries

Cross-package imports must use published entry points — never deep paths into
another package's internals.

**Allowed public entries:**

| Package                | Entry points                                                   | Role                                                          |
| ---------------------- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| `@mmx/contracts`       | `./animation`, `./terrain`                                     | Small serialized contracts; intentionally no root entry       |
| `@mmx/content-schema`  | `.`, `./slopes`                                                | Authoring document model and slope baking                     |
| `@mmx/project-schema`  | `.`                                                            | Portable Studio project and asset manifest                    |
| `@mmx/engine`          | `.`, `./content`, `./data`, `./behaviors`, `./tooling`         | Gameplay simulation and intentional compiler/tooling sub-APIs |
| `@mmx/browser-input`   | `.`                                                            | Keyboard/gamepad action input                                 |
| `@mmx/client-settings` | `.`                                                            | Versioned client settings                                     |
| `@mmx/browser-audio`   | `.`                                                            | Browser sound loading and gameplay audio                      |
| `@mmx/renderer-pixi`   | `.`, `./presentation`, `./debug`                               | Renderer, scene presentation, and debug geometry              |
| `@mmx/runtime`         | `.`, `./browser`, `./player`, `./tooling`, `./debug`, `./host` | Session lifecycle, scheduling, debug, and host contracts      |
| `@mmx/build-tools`     | `.`, `./vite`                                                  | Project compiler and Vite integration                         |

**Forbidden:**

- `@mmx/engine/game/*`
- `@mmx/engine/core/*`
- `@mmx/renderer-pixi/render/*`

Deep imports couple consumers to file layout and block refactors. The Oxlint
`no-restricted-imports` rule plus `scripts/check-forbidden-imports.mjs` (wired
into `pnpm lint`) reject them for static imports, `import type`, re-exports,
dynamic `import()`, and `require()`.

### Scene presentation

`@mmx/renderer-pixi/presentation` owns shared Pixi scene cosmetics for Web and
Studio: animation binding, trails, dash smoke, enemy death FX, scene rebinding,
and host-agnostic fitting. Hosts keep only adapter concerns (Web audio/UI/fit
policy, Studio canvas/`ResizeObserver`/decorations).

`@mmx/renderer-pixi/debug` exposes the read-only geometry overlay
(`DebugOverlay` + `DebugRenderOptions`). Presentation accepts
`setDebugOptions`; runtime debugger UI/state belongs elsewhere.

### Exposing a new public API

1. Add the symbol to the package's intentional entry (`src/index.ts` or a named
   subpath such as `./tooling`) — export the minimal surface, not a barrel of
   internals.
2. Keep `package.json` `exports` limited to those entry points.
3. Migrate callers to the public path; do not work around the rule with relative
   imports that cross package roots.
4. Extend `scripts/__fixtures__/import-boundaries` only when adding a new _forbidden_
   pattern or a new _allowed_ public package entry that the guard should
   document.

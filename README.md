# mmx-core-ts

A faithful **TypeScript / Node** port of the _core player gameplay_ from the
[Mega Man X8 16-bit](../Mega-Man-X8-16-bit) Godot project — the movement state
machine (walk / dash / variable jump / air-dash / wall-slide / wall-jump /
dash-jump), hurt/knockback, plus buster shooting and charge shots.

The engine is **pure TypeScript** with no runtime dependencies. It runs three ways:

- **Headless** in Node (deterministic, scripted input) — `npm run sim`
- **In the browser** on a canvas with real keyboard input — `npm run play`
- **As a desktop app** through Tauri 2 — `npm run desktop:dev`

---

## Quick start

```bash
npm install

npm run sim      # deterministic headless simulation, prints a state trace
npm test         # unit tests (node:test) for the movement/shooting behaviour
npm run play     # build + serve -> open http://localhost:8080 and play
npm run desktop:dev    # launch the desktop app with Vite hot reload
npm run desktop:build  # build the native executable and platform installers
```

Controls (browser and desktop): **← →** / **A D** move · **Space** jump (hold for height) ·
**Shift** / **L** dash · **J** fire (tap = lemon, hold+release = charged) ·
hold _into_ a wall while falling to wall-slide, then **Space** to wall-kick.

### Desktop prerequisites

The desktop shell uses **Tauri 2** and leaves the TypeScript engine and PixiJS
renderer unchanged. Install Rust plus the native prerequisites for your operating
system before using the desktop commands. On Windows that means Microsoft C++ Build
Tools and WebView2; current Windows releases normally already include WebView2.

Production artifacts are written below `src-tauri/target/release/`. Windows builds
produce the standalone executable along with MSI and NSIS installers under
`src-tauri/target/release/bundle/`.

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

Key numbers (all reproduced in [`src/core/constants.ts`](src/core/constants.ts)):
gravity `900`, max fall `375`, walk `90`, jump `320`, dash `~200`, dash duration
`0.55s`, jump max time `0.625s`, jump buffer `0.1s`, charge thresholds
`0.5 / 1.75 / 2.75s`.

---

## How this port maps to it

| Godot source                                                                   | This project                                                                                                  |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------- |
| `Actor.gd` (physics, health, sensors)                                          | [`src/engine/Actor.ts`](src/engine/Actor.ts)                                                                  |
| `move_and_slide()` + `RayCast2D` columns                                       | [`src/engine/World.ts`](src/engine/World.ts) AABB tile collision + edge sensors                               |
| `AbilityUser.gd` (moveset + runtime)                                           | [`src/engine/AbilityUser.ts`](src/engine/AbilityUser.ts)                                                      |
| `Character.gd` (input, wall/land)                                              | [`src/engine/Character.ts`](src/engine/Character.ts)                                                          |
| `Player.gd` / `Player.tscn` node list                                          | [`src/engine/Player.ts`](src/engine/Player.ts)                                                                |
| `BaseAbility.gd` / `Ability.gd` / `Movement.gd`                                | [`src/engine/ability/`](src/engine/ability/)                                                                  |
| `Idle/Walk/Fall/Jump/Dash/AirDash/Wallslide/Walljump/DashWallJump/DashJump.gd` | [`src/engine/abilities/`](src/engine/abilities/)                                                              |
| `Shot.gd` (PrimaryShot) / `Charge.gd`                                          | [`src/engine/abilities/Shot.ts`](src/engine/abilities/Shot.ts), [`Charge.ts`](src/engine/abilities/Charge.ts) |
| `Damage.gd` (hurt, knockback, invulnerability)                                 | [`src/engine/abilities/Damage.ts`](src/engine/abilities/Damage.ts)                                            |
| `Lemon.gd` / `WeaponShot.gd`                                                   | [`src/engine/Projectile.ts`](src/engine/Projectile.ts)                                                        |
| `Enemy.gd` + `EnemyShield` / `EnemyDamage` / `EnemyDeath` / `DamageOnTouch`    | [`src/engine/Enemy.ts`](src/engine/Enemy.ts)                                                                  |
| `AI.gd` (event -> ability lists)                                               | [`src/engine/EnemyAI.ts`](src/engine/EnemyAI.ts)                                                              |
| `EnemyAbility.gd` / `AttackAbility.gd`                                         | [`src/engine/enemy/EnemyAbility.ts`](src/engine/enemy/EnemyAbility.ts)                                        |
| `CrabPatrol` / `Hide` / `EnemyStun` / `BeePatrol` / `BatPursuit` / `BatJump`   | [`src/engine/enemy/`](src/engine/enemy/)                                                                      |
| `Metool.tscn` / `SmallBat.tscn` node lists                                     | [`src/engine/enemies/index.ts`](src/engine/enemies/index.ts)                                                  |
| Area2D layer/mask overlaps (shots, contact damage)                             | [`src/engine/Stage.ts`](src/engine/Stage.ts)                                                                  |
| `AnimatedSprite2D` playback + `x.res` / `x_leftarm.res`                        | [`src/engine/Animation.ts`](src/engine/Animation.ts)                                                          |
| Godot `Input` singleton                                                        | [`src/core/Input.ts`](src/core/Input.ts)                                                                      |
| Godot signals                                                                  | [`src/core/Events.ts`](src/core/Events.ts)                                                                    |

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
- **Collision** is flat-tile AABB (no slopes / moving platforms / conveyors); the
  raycast wall/reach queries become edge samples.
- **Some cosmetics remain scoped**: the player/enemy effects used by the current
  room and their original sounds are ported; unrelated shaders are not. Animation
  is engine state rather than a cosmetic — see below.

### Animation

The sprite is part of the engine, not the renderer, because the original's abilities
read it back: `Movement.change_animation_if_falling` tests `get_animation() != "fall"`,
`Walk` advances `walk_start -> walk` on Godot's `animation_finished` signal, and
`IdleWeak` settles `recover -> idle` (or `weak` at low health) the same way.
[`Animation.ts`](src/engine/Animation.ts) reproduces `AnimatedSprite2D` playback —
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
_layer_: [`tools/build-anims.mjs`](tools/build-anims.mjs) writes both atlases' regions
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
state is chosen by [`EnemyAI`](src/engine/EnemyAI.ts) from the event lists its
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

[`tools/build-enemies.mjs`](tools/build-enemies.mjs) (`npm run enemies:import`)
builds `src/web/assets/enemy_anims.json` from the Godot project's **Aseprite**
sidecars, not its `.res` SpriteFrames — the enemies still have their source
`.json` checked in, and it carries per-frame atlas rects, per-frame durations in
milliseconds, and `meta.frameTags` naming the clips. The one thing it cannot carry
is whether a clip loops, which lives in the Godot resource; that is declared in the
script and is load-bearing rather than cosmetic (a looping `stun` would leave a
Metool stunned forever, since `EnemyStun` advances on `animation_finished`).

### Not ported (extension points)

Documented but out of scope: armor sets (Hermes / Icarus and their gameplay
modifiers), boss weapons, Ride Armor, sub-tanks, player death, and the AirJump
double-jump. The ability framework is built to accept these as additional
`BaseAbility` subclasses exactly as the original does.

---

## Project layout

```
src/
  core/        Vec2, Input, EventBus, constants
  engine/
    World.ts        tile collision world
    Actor.ts        physics body + sensors
    AbilityUser.ts  state-machine driver
    Character.ts    input + player API
    Player.ts       assembles the moveset ("X")
    Projectile.ts   buster shots
    Animation.ts    AnimatedSprite playback + the shot layer
    Stage.ts        the room: player + enemies + the damage between them
    Enemy.ts        enemy body, shield, damage and death
    EnemyAI.ts      AI.gd's event -> ability dispatch
    level.ts        a test chamber exercising every state
    ability/        BaseAbility / Ability / Movement
    abilities/      Idle, Walk, Fall, Jump, Dash, AirDash, WallSlide,
                    WallJump, DashWallJump, DashJump, Shot, Charge
    enemy/          EnemyAbility + Patrol, Hide, Stun, Death,
                    Hover, Pursuit, Recoil
    enemies/        Metool and Bat, as ports of their .tscn node lists
  sim/run.ts   deterministic headless simulation
  web/main.ts  canvas renderer + keyboard input
  web/assets/  x.png, x_leftarm.png (arm-pointing), x_anims.json,
               metool.png, sbat.png, enemy_anims.json
  server.ts    zero-dependency static server
tests/         node:test behaviour tests
tools/         build-anims.mjs    — re-derives x_anims.json from the Godot project
               build-enemies.mjs  — builds enemy_anims.json from its Aseprite sheets
               import-ldtk.mjs    — compiles levels/*.ldtk into src/engine/levels/
```
